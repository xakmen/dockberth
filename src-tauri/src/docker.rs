//! Thin wrappers around the Docker CLI.
//!
//! Dockberth never talks to the Docker Engine API directly — every Docker
//! interaction shells out to the `docker` CLI via the Tauri shell plugin.
//! The CLI is identical on all platforms, which keeps this module portable;
//! engine *detection* is the only per-platform part (see
//! docs/ARCHITECTURE.md).

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
    /// True when Docker is present on this machine (CLI responded or the
    /// Docker Desktop app was found) even if the daemon is not running.
    pub installed: bool,
    /// Server version if the daemon is running, otherwise client version if
    /// only the CLI is installed.
    pub version: Option<String>,
    /// Human-readable error when Docker is unreachable or not installed.
    pub error: Option<String>,
}

/// Locate the Docker Desktop executable. Per-platform lookup; the command
/// surface (`docker_start`) stays identical for future macOS/Linux ports.
#[cfg(target_os = "windows")]
fn docker_desktop_exe() -> Option<std::path::PathBuf> {
    let mut candidates: Vec<std::path::PathBuf> = Vec::new();
    if let Some(pf) = std::env::var_os("ProgramFiles") {
        candidates.push(
            std::path::PathBuf::from(pf)
                .join("Docker")
                .join("Docker")
                .join("Docker Desktop.exe"),
        );
    }
    // Per-user installs land under %LOCALAPPDATA%.
    if let Some(lad) = std::env::var_os("LOCALAPPDATA") {
        candidates.push(
            std::path::PathBuf::from(lad)
                .join("Docker")
                .join("Docker")
                .join("Docker Desktop.exe"),
        );
    }
    candidates.into_iter().find(|p| p.exists())
}

#[cfg(not(target_os = "windows"))]
fn docker_desktop_exe() -> Option<std::path::PathBuf> {
    None
}

/// Launch Docker Desktop detached and return immediately — the frontend
/// polls `docker_version` until the daemon reports ready.
#[tauri::command]
pub fn docker_start() -> Result<(), String> {
    let exe = docker_desktop_exe()
        .ok_or_else(|| "Docker Desktop executable not found".to_string())?;
    std::process::Command::new(&exe)
        .spawn()
        .map_err(|e| format!("failed to launch {}: {e}", exe.display()))?;
    Ok(())
}

/// Probe Docker by running `docker version --format json`.
#[tauri::command]
pub async fn docker_version(app: AppHandle) -> DockerStatus {
    let output = match run_docker(&app, &["version", "--format", "json"]).await {
        Ok(output) => output,
        Err(err) => {
            // CLI missing — Docker Desktop may still be installed but not
            // on PATH (or never started); check for the app itself.
            return DockerStatus {
                running: false,
                installed: docker_desktop_exe().is_some(),
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
            installed: true,
            version: Some(version),
            error: None,
        },
        None => DockerStatus {
            running: false,
            installed: true, // the CLI itself responded
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
