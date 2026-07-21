//! Live log streaming: `docker compose logs --follow` piped to the frontend
//! as an IPC channel, one session per project. Each session is tracked by a
//! monotonic id plus the follower PID, so the whole process tree (docker.exe
//! → docker-compose.exe, or wsl.exe → in-distro docker) can be killed and
//! orphaned followers cannot accumulate. The forwarding task removes its own
//! entry when the follower ends (id-guarded), so a stale PID is never handed
//! to taskkill — Windows reuses PIDs, and killing a reused one would take
//! down an unrelated process tree.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

use crate::projects::{compose_file, effective_location, find_entry, read_config};
use crate::registry::Location;
use crate::template::is_valid_project_name;

struct Session {
    /// Distinguishes successive followers for the same project so a late
    /// event from an old one cannot clear a newer session's entry.
    id: u64,
    pid: u32,
}

/// project name → live follower session.
#[derive(Default)]
pub struct LogSessions {
    map: Mutex<HashMap<String, Session>>,
    next_id: AtomicU64,
}

impl LogSessions {
    /// Register a freshly spawned follower, returning its session id.
    fn register(&self, name: String, pid: u32) -> u64 {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        self.map.lock().unwrap().insert(name, Session { id, pid });
        id
    }

    /// Remove `name`'s entry unconditionally, returning its PID.
    fn take(&self, name: &str) -> Option<u32> {
        self.map.lock().unwrap().remove(name).map(|s| s.pid)
    }

    /// Remove `name`'s entry only if it is still session `id` — a newer
    /// `logs_start` must not be cleared by the old follower's end event.
    fn take_if(&self, name: &str, id: u64) -> Option<u32> {
        let mut map = self.map.lock().unwrap();
        if map.get(name).is_some_and(|s| s.id == id) {
            map.remove(name).map(|s| s.pid)
        } else {
            None
        }
    }

    fn drain_pids(&self) -> Vec<u32> {
        self.map.lock().unwrap().drain().map(|(_, s)| s.pid).collect()
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum LogEvent {
    Line { line: String, stderr: bool },
    End { error: Option<String> },
}

/// Kill a process and its whole tree. taskkill /T is Windows-only, like
/// this module's callers; the macOS/Linux port will use process groups.
pub(crate) fn kill_tree(pid: u32) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let _ = std::process::Command::new("taskkill")
            .args(["/T", "/F", "/PID", &pid.to_string()])
            .creation_flags(CREATE_NO_WINDOW)
            .status();
    }
}

fn stop_session(sessions: &LogSessions, name: &str) {
    if let Some(pid) = sessions.take(name) {
        kill_tree(pid);
    }
}

pub fn kill_all(sessions: &LogSessions) {
    for pid in sessions.drain_pids() {
        kill_tree(pid);
    }
}

/// Start streaming logs for a project (optionally limited to services).
/// Any existing session for the same project is stopped first.
#[tauri::command]
pub async fn logs_start(
    app: AppHandle,
    sessions: State<'_, LogSessions>,
    name: String,
    services: Vec<String>,
    channel: Channel<LogEvent>,
) -> Result<(), String> {
    if !is_valid_project_name(&name) {
        return Err(format!("invalid project name '{name}'"));
    }
    // Service names go straight into the docker/compose argv — validate them
    // so a value like "--since=..." or "-f other.yml" can't change the
    // command (matches project_open_shell).
    for service in &services {
        if !crate::projects::is_valid_service_name(service) {
            return Err(format!("invalid service name '{service}'"));
        }
    }
    stop_session(&sessions, &name);

    let entry = find_entry(&app, &name)?;
    let config = read_config(&entry.path);

    const LOG_ARGS: [&str; 4] = ["--follow", "--tail", "200", "--timestamps"];
    let (program, mut args) = match effective_location(&entry, config.as_ref()) {
        Location::Ntfs { windows_path } => {
            let file = compose_file(&windows_path);
            let mut a = vec!["compose".to_string(), "-f".to_string(), file, "logs".to_string()];
            a.extend(LOG_ARGS.map(String::from));
            ("docker".to_string(), a)
        }
        Location::Wsl { distro, linux_path } => {
            let mut a = vec![
                "-d".to_string(),
                distro,
                "--cd".to_string(),
                linux_path,
                "--".to_string(),
                "docker".to_string(),
                "compose".to_string(),
                "-f".to_string(),
                ".dockberth/docker-compose.yml".to_string(),
                "logs".to_string(),
            ];
            a.extend(LOG_ARGS.map(String::from));
            ("wsl.exe".to_string(), a)
        }
    };
    args.extend(services);

    let (mut rx, child) = app
        .shell()
        .command(program)
        .args(args)
        .spawn()
        .map_err(|e| format!("cannot start log stream: {e}"))?;
    let id = sessions.register(name.clone(), child.pid());

    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut frontend_gone = false;
        while let Some(event) = rx.recv().await {
            let result = match event {
                CommandEvent::Stdout(bytes) => channel.send(LogEvent::Line {
                    line: String::from_utf8_lossy(&bytes).trim_end().to_string(),
                    stderr: false,
                }),
                CommandEvent::Stderr(bytes) => channel.send(LogEvent::Line {
                    line: String::from_utf8_lossy(&bytes).trim_end().to_string(),
                    stderr: true,
                }),
                CommandEvent::Terminated(_) => {
                    let _ = channel.send(LogEvent::End { error: None });
                    break;
                }
                CommandEvent::Error(err) => {
                    let _ = channel.send(LogEvent::End { error: Some(err) });
                    break;
                }
                _ => Ok(()),
            };
            if result.is_err() {
                frontend_gone = true; // channel closed — stop forwarding
                break;
            }
        }
        // Drop this session's entry (id-guarded, so a newer follower for the
        // same project is left alone). On normal termination the process is
        // already gone; if the frontend vanished while it is still running,
        // kill the tree so the follower is not orphaned.
        if let Some(pid) = app.state::<LogSessions>().take_if(&name, id) {
            if frontend_gone {
                kill_tree(pid);
            }
        }
    });
    Ok(())
}

/// Stop the log stream for a project (kills the follower process tree).
#[tauri::command]
pub fn logs_stop(sessions: State<'_, LogSessions>, name: String) {
    stop_session(&sessions, &name);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn take_if_is_guarded_by_session_id() {
        let s = LogSessions::default();
        let id1 = s.register("shop".into(), 100);
        // A restart replaces the entry (as logs_start's stop-then-start does).
        assert_eq!(s.take("shop"), Some(100));
        let id2 = s.register("shop".into(), 200);
        assert_ne!(id1, id2);

        // The old follower's late cleanup must NOT remove the new session —
        // this is what stops a stale PID reaching taskkill.
        assert_eq!(s.take_if("shop", id1), None);
        // The current session cleans up itself and yields its PID.
        assert_eq!(s.take_if("shop", id2), Some(200));
        assert!(s.drain_pids().is_empty());
    }

    #[test]
    fn drain_pids_empties_and_returns_all() {
        let s = LogSessions::default();
        s.register("a".into(), 1);
        s.register("b".into(), 2);
        let mut pids = s.drain_pids();
        pids.sort_unstable();
        assert_eq!(pids, vec![1, 2]);
        assert!(s.drain_pids().is_empty());
    }
}
