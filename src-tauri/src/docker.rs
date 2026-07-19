//! Thin wrappers around the Docker CLI.
//!
//! Dockberth never talks to the Docker Engine API directly — every Docker
//! interaction shells out to the `docker` CLI via the Tauri shell plugin.
//! The CLI is identical on all platforms, which keeps this module portable;
//! engine *detection* is the only per-platform part (see CLAUDE.md).

use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_shell::process::Output;
use tauri_plugin_shell::ShellExt;

/// Run `docker <args>` and return the raw output.
pub async fn run_docker(app: &AppHandle, args: &[&str]) -> Result<Output, String> {
    app.shell()
        .command("docker")
        .args(args)
        .output()
        .await
        .map_err(|e| format!("docker CLI not found: {e}"))
}

/// Run `docker <args>`, failing with stderr when the exit code is non-zero.
pub async fn run_docker_checked(app: &AppHandle, args: &[&str]) -> Result<String, String> {
    let output = run_docker(app, args).await?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!(
            "docker {} failed: {}",
            args.join(" "),
            stderr.trim()
        ))
    }
}

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
    let output = match run_docker(&app, &["version", "--format", "json"]).await {
        Ok(output) => output,
        Err(err) => {
            return DockerStatus {
                running: false,
                version: None,
                error: Some(err),
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

/// Map a `docker ps` container state to the coarse project/service status
/// used by the UI: running | starting | stopped.
pub fn map_container_state(state: &str) -> &'static str {
    match state {
        "running" => "running",
        "created" | "restarting" => "starting",
        _ => "stopped",
    }
}
