//! Thin wrappers around the Docker CLI.
//!
//! Dockberth never talks to the Docker Engine API directly — every Docker
//! interaction shells out to the `docker` CLI via the Tauri shell plugin.
//! Business logic (compose generation, project state) lives in the frontend;
//! this module only executes commands and returns raw results.

use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

/// Result of probing the local Docker installation.
#[derive(Serialize)]
pub struct DockerStatus {
    /// True when the Docker daemon answered (`Server` section present).
    pub running: bool,
    /// Server version if the daemon is running, otherwise client version if
    /// only the CLI is installed.
    pub version: Option<String>,
    /// Human-readable error when Docker is unreachable or not installed.
    pub error: Option<String>,
}

/// Probe Docker by running `docker version --format json`.
#[tauri::command]
pub async fn docker_version(app: AppHandle) -> DockerStatus {
    let output = app
        .shell()
        .command("docker")
        .args(["version", "--format", "json"])
        .output()
        .await;

    let output = match output {
        Ok(output) => output,
        Err(err) => {
            return DockerStatus {
                running: false,
                version: None,
                error: Some(format!("docker CLI not found: {err}")),
            }
        }
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed: Option<serde_json::Value> = serde_json::from_str(stdout.trim()).ok();

    let server_version = parsed
        .as_ref()
        .and_then(|v| v["Server"]["Version"].as_str())
        .map(String::from);
    let client_version = parsed
        .as_ref()
        .and_then(|v| v["Client"]["Version"].as_str())
        .map(String::from);

    match server_version {
        Some(version) => DockerStatus {
            running: true,
            version: Some(version),
            error: None,
        },
        None => DockerStatus {
            running: false,
            version: client_version,
            error: Some(if output.status.success() {
                "Docker daemon did not report a server version".to_string()
            } else {
                String::from_utf8_lossy(&output.stderr).trim().to_string()
            }),
        },
    }
}

// TODO: docker_compose_up / docker_compose_down — run `docker compose` against
//       the generated file in <project>/.dockberth/, either directly (NTFS
//       paths) or through wsl.exe (WSL2 paths, see wsl.rs).
// TODO: docker_ps — list containers for a project (label-filtered).
// TODO: docker_logs — stream container logs to the frontend via a Tauri event
//       channel.
