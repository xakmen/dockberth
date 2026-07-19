//! Live log streaming: `docker compose logs --follow` piped to the frontend
//! as an IPC channel, one session per project. Sessions are tracked by PID
//! so the whole process tree (docker.exe → docker-compose.exe, or wsl.exe →
//! in-distro docker) can be killed — orphaned followers must not accumulate.

use std::collections::HashMap;
use std::sync::Mutex;

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, State};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

use crate::projects::{compose_file, effective_location, find_entry, read_config};
use crate::registry::Location;
use crate::template::is_valid_project_name;

/// project name → PID of the log-follower process.
#[derive(Default)]
pub struct LogSessions(Mutex<HashMap<String, u32>>);

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum LogEvent {
    Line { line: String, stderr: bool },
    End { error: Option<String> },
}

/// Kill a process and its whole tree. taskkill /T is Windows-only, like
/// this module's callers; the macOS/Linux port will use process groups.
fn kill_tree(pid: u32) {
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
    let pid = sessions.0.lock().unwrap().remove(name);
    if let Some(pid) = pid {
        kill_tree(pid);
    }
}

pub fn kill_all(sessions: &LogSessions) {
    let pids: Vec<u32> = sessions.0.lock().unwrap().drain().map(|(_, pid)| pid).collect();
    for pid in pids {
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
    sessions.0.lock().unwrap().insert(name.clone(), child.pid());

    tauri::async_runtime::spawn(async move {
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
                break; // frontend went away — stop forwarding
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
