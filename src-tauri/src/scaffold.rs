//! "New project" scaffolding: run a preset's one-off scaffold container
//! (e.g. `wordpress:cli wp core download`) with the target folder mounted,
//! streaming output to the dialog. Location-aware like the runtime:
//! WSL2 targets run inside the distro with the distro user's UID/GID
//! (files belong to the user); NTFS targets run as root, consistent with
//! the NTFS runtime policy. On failure or cancel, whatever the scaffold
//! wrote is removed — a folder we created is deleted entirely, a
//! pre-existing (empty) folder is emptied. Nothing else is ever touched.

use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::AppHandle;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

use crate::preset::{self, ScaffoldSpec};
use crate::registry::{derive_location, Location};
use crate::template::is_valid_project_name;
use crate::wsl;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum ScaffoldEvent {
    /// One output line. `pulling` marks docker-image-pull progress so the
    /// UI can label the phase ("first time only") distinctly.
    Line { line: String, pulling: bool },
    Done,
    Failed { error: String },
}

fn container_name(project: &str) -> String {
    format!("dockberth-scaffold-{project}")
}

/// Resolve and prepare the scaffold target `<parent>/<name>`:
/// must not exist yet (we create it) or must be an empty directory.
/// Returns (target_path, created_by_us).
pub fn prepare_target(parent: &str, name: &str) -> Result<(PathBuf, bool), String> {
    if !is_valid_project_name(name) {
        return Err(format!(
            "invalid project name '{name}': use lowercase letters, digits and hyphens"
        ));
    }
    let parent_dir = Path::new(parent);
    if !parent_dir.is_dir() {
        return Err(format!("'{parent}' is not a directory"));
    }
    let target = parent_dir.join(name);
    if target.exists() {
        if !target.is_dir() {
            return Err(format!("'{}' exists and is not a directory", target.display()));
        }
        let mut entries = std::fs::read_dir(&target)
            .map_err(|e| format!("cannot inspect '{}': {e}", target.display()))?;
        if entries.next().is_some() {
            return Err(format!(
                "'{}' already exists and is not empty",
                target.display()
            ));
        }
        Ok((target, false))
    } else {
        std::fs::create_dir(&target)
            .map_err(|e| format!("cannot create '{}': {e}", target.display()))?;
        Ok((target, true))
    }
}

/// Remove scaffold output after failure/cancel: delete the folder if we
/// created it, otherwise (pre-existing empty folder) just empty it again.
pub fn cleanup_target(target: &Path, created_by_us: bool) {
    if created_by_us {
        let _ = std::fs::remove_dir_all(target);
    } else if let Ok(entries) = std::fs::read_dir(target) {
        for entry in entries.flatten() {
            let path = entry.path();
            let _ = if path.is_dir() {
                std::fs::remove_dir_all(&path)
            } else {
                std::fs::remove_file(&path)
            };
        }
    }
}

/// Build the scaffold command (program + args) routed by location. The
/// target is mounted at the PHP base's app dir; WSL runs unprivileged as
/// the distro user, NTFS runs as root (runtime policy parity).
pub fn build_command(
    location: &Location,
    spec: &ScaffoldSpec,
    project: &str,
    uid_gid: Option<(u32, u32)>,
) -> (String, Vec<String>) {
    let name = container_name(project);
    let env_args = |args: &mut Vec<String>| {
        for (key, value) in &spec.env {
            args.push("-e".to_string());
            args.push(format!("{key}={value}"));
        }
    };
    match location {
        Location::Ntfs { windows_path } => {
            let mut args: Vec<String> = [
                "run", "--rm", "--name", &name, "--user", "root",
            ]
            .map(String::from)
            .to_vec();
            env_args(&mut args);
            args.push("-v".to_string());
            args.push(format!("{windows_path}:/var/www/html"));
            args.push(spec.image.clone());
            args.extend(spec.args.iter().cloned());
            ("docker".to_string(), args)
        }
        Location::Wsl { distro, linux_path } => {
            let (uid, gid) = uid_gid.unwrap_or((1000, 1000));
            let mut args: Vec<String> = ["-d", distro, "--", "docker", "run", "--rm", "--name"]
                .map(String::from)
                .to_vec();
            args.push(name);
            args.push("--user".to_string());
            args.push(format!("{uid}:{gid}"));
            env_args(&mut args);
            args.push("-v".to_string());
            args.push(format!("{linux_path}:/var/www/html"));
            args.push(spec.image.clone());
            args.extend(spec.args.iter().cloned());
            ("wsl.exe".to_string(), args)
        }
    }
}

fn looks_like_pull(line: &str) -> bool {
    line.contains("Unable to find image")
        || line.contains("Pulling from")
        || line.contains("Pull complete")
        || line.contains("Download complete")
        || line.contains("Downloading [")
        || line.contains("Extracting [")
        || line.contains("Digest: sha256")
        || line.contains("Status: Downloaded newer image")
}

/// Run the preset's scaffold into `<parentPath>/<name>`, streaming output.
/// Emits Done on success; on failure/cancel emits Failed after removing
/// whatever the scaffold wrote.
#[tauri::command]
pub async fn scaffold_project(
    app: AppHandle,
    parent_path: String,
    name: String,
    preset: String,
    channel: Channel<ScaffoldEvent>,
) -> Result<(), String> {
    let preset = preset::find_preset(&preset)
        .ok_or_else(|| format!("unknown preset '{preset}'"))?;
    let spec = preset
        .scaffold
        .clone()
        .ok_or_else(|| format!("preset '{}' does not support scaffolding yet", preset.id))?;

    let (target, created_by_us) = prepare_target(&parent_path, &name)?;
    let target_str = target.to_string_lossy().into_owned();
    let location = derive_location(&target_str);
    let uid_gid = match &location {
        Location::Wsl { distro, .. } => Some(wsl::default_uid_gid(&app, distro).await?),
        Location::Ntfs { .. } => None,
    };

    let (program, args) = build_command(&location, &spec, &name, uid_gid);
    let spawned = app
        .shell()
        .command(&program)
        .args(&args)
        .spawn()
        .map_err(|e| format!("cannot start scaffold container: {e}"));
    let (mut rx, _child) = match spawned {
        Ok(pair) => pair,
        Err(e) => {
            cleanup_target(&target, created_by_us);
            return Err(e);
        }
    };

    tauri::async_runtime::spawn(async move {
        let mut tail: Vec<String> = Vec::new();
        let mut code: Option<i32> = None;
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes) => {
                    let line = String::from_utf8_lossy(&bytes).trim_end().to_string();
                    if line.is_empty() {
                        continue;
                    }
                    tail.push(line.clone());
                    if tail.len() > 15 {
                        tail.remove(0);
                    }
                    let _ = channel.send(ScaffoldEvent::Line {
                        pulling: looks_like_pull(&line),
                        line,
                    });
                }
                CommandEvent::Terminated(payload) => {
                    code = payload.code;
                    break;
                }
                CommandEvent::Error(err) => {
                    tail.push(err);
                    break;
                }
                _ => {}
            }
        }
        if code == Some(0) {
            let _ = channel.send(ScaffoldEvent::Done);
        } else {
            cleanup_target(&target, created_by_us);
            let _ = channel.send(ScaffoldEvent::Failed {
                error: format!(
                    "scaffold exited with {:?}:\n{}",
                    code,
                    tail.join("\n")
                ),
            });
        }
    });
    Ok(())
}

/// Cancel a running scaffold: force-remove its container (the `docker run`
/// client then exits non-zero and the runner task cleans the target up).
#[tauri::command]
pub async fn scaffold_cancel(
    app: AppHandle,
    name: String,
    parent_path: String,
) -> Result<(), String> {
    if !is_valid_project_name(&name) {
        return Err(format!("invalid project name '{name}'"));
    }
    let target = Path::new(&parent_path).join(&name);
    let container = container_name(&name);
    match derive_location(&target.to_string_lossy()) {
        Location::Ntfs { .. } => {
            let _ = crate::docker::run_docker(&app, &["rm", "-f", &container]).await;
        }
        Location::Wsl { distro, .. } => {
            let _ = wsl::run_in_distro(&app, &distro, None, &["docker", "rm", "-f", &container])
                .await;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_parent(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("dockberth-scaffold-test-{tag}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn prepare_creates_missing_target() {
        let parent = temp_parent("create");
        let (target, created) = prepare_target(parent.to_str().unwrap(), "shop").unwrap();
        assert!(created);
        assert!(target.is_dir());
    }

    #[test]
    fn prepare_accepts_empty_existing_target() {
        let parent = temp_parent("empty");
        fs::create_dir(parent.join("shop")).unwrap();
        let (_, created) = prepare_target(parent.to_str().unwrap(), "shop").unwrap();
        assert!(!created);
    }

    #[test]
    fn prepare_rejects_non_empty_target_and_bad_names() {
        let parent = temp_parent("nonempty");
        fs::create_dir(parent.join("shop")).unwrap();
        fs::write(parent.join("shop").join("index.php"), "x").unwrap();
        assert!(prepare_target(parent.to_str().unwrap(), "shop").is_err());
        assert!(prepare_target(parent.to_str().unwrap(), "Bad Name").is_err());
    }

    #[test]
    fn cleanup_removes_created_dir_but_only_empties_preexisting() {
        let parent = temp_parent("cleanup");
        let created = parent.join("a");
        fs::create_dir(&created).unwrap();
        fs::write(created.join("f.txt"), "x").unwrap();
        cleanup_target(&created, true);
        assert!(!created.exists());

        let preexisting = parent.join("b");
        fs::create_dir(&preexisting).unwrap();
        fs::write(preexisting.join("f.txt"), "x").unwrap();
        fs::create_dir(preexisting.join("sub")).unwrap();
        cleanup_target(&preexisting, false);
        assert!(preexisting.exists());
        assert_eq!(fs::read_dir(&preexisting).unwrap().count(), 0);
    }

    #[test]
    fn builds_ntfs_command_as_root() {
        let spec = ScaffoldSpec {
            image: "wordpress:cli".into(),
            args: vec!["wp".into(), "core".into(), "download".into()],
            env: Default::default(),
        };
        let location = Location::Ntfs {
            windows_path: r"C:\Users\dev\sites\shop".into(),
        };
        let (program, args) = build_command(&location, &spec, "shop", None);
        assert_eq!(program, "docker");
        assert_eq!(
            args,
            [
                "run", "--rm", "--name", "dockberth-scaffold-shop", "--user", "root", "-v",
                r"C:\Users\dev\sites\shop:/var/www/html", "wordpress:cli", "wp", "core",
                "download"
            ]
        );
    }

    #[test]
    fn builds_wsl_command_as_distro_user_with_env() {
        let spec = ScaffoldSpec {
            image: "wordpress:cli".into(),
            args: vec!["wp".into()],
            env: [("HOME".to_string(), "/tmp".to_string())].into_iter().collect(),
        };
        let location = Location::Wsl {
            distro: "Ubuntu-24.04".into(),
            linux_path: "/home/dev/sites/shop".into(),
        };
        let (program, args) = build_command(&location, &spec, "shop", Some((1000, 1000)));
        assert_eq!(program, "wsl.exe");
        assert_eq!(
            args,
            [
                "-d", "Ubuntu-24.04", "--", "docker", "run", "--rm", "--name",
                "dockberth-scaffold-shop", "--user", "1000:1000", "-e", "HOME=/tmp",
                "-v", "/home/dev/sites/shop:/var/www/html", "wordpress:cli", "wp"
            ]
        );
    }
}
