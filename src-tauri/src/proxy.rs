//! Global Traefik proxy lifecycle.
//!
//! One Traefik v3 container per machine (`dockberth-proxy`) owns host port
//! 80 (bound to loopback) and routes `<name>.<suffix>` domains (from settings,
//! default "test") to project containers on the external `dockberth`
//! Docker network. The proxy itself is suffix-agnostic — the routed domain
//! is baked into each project's compose file as a Traefik label. The compose file is deployed from the
//! embedded template into the app data directory and started with
//! `docker compose up -d`.

use std::fs;

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::docker::{run_docker, run_docker_checked};
use crate::template;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyStatus {
    pub running: bool,
    pub error: Option<String>,
}

async fn ensure_inner(app: &AppHandle) -> Result<(), String> {
    // 1. Ensure the shared "dockberth" network exists.
    let inspect = run_docker(app, &["network", "inspect", "dockberth"]).await?;
    if !inspect.status.success() {
        run_docker_checked(app, &["network", "create", "dockberth"]).await?;
    }

    // 2. Deploy the compose file into <app-data>/proxy/ (overwrite so
    //    template updates ship with app updates).
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("cannot resolve app data dir: {e}"))?
        .join("proxy");
    fs::create_dir_all(&dir).map_err(|e| format!("cannot create proxy dir: {e}"))?;
    let compose_path = dir.join("docker-compose.yml");
    crate::atomic::write(&compose_path, template::proxy_compose())
        .map_err(|e| format!("cannot write proxy compose file: {e}"))?;

    // 3. Start (or update) the proxy.
    let compose_path = compose_path.to_string_lossy().into_owned();
    run_docker_checked(app, &["compose", "-f", &compose_path, "up", "-d"]).await?;

    // 4. Verify the container is actually running.
    let state = run_docker_checked(
        app,
        &["inspect", "-f", "{{.State.Running}}", "dockberth-proxy"],
    )
    .await?;
    if state.trim() != "true" {
        return Err("dockberth-proxy container is not running".to_string());
    }
    Ok(())
}

/// Ensure the shared network and the Traefik proxy are up.
/// Called on app start (after the Docker check) and retryable from the UI.
#[tauri::command]
pub async fn proxy_ensure(app: AppHandle) -> ProxyStatus {
    match ensure_inner(&app).await {
        Ok(()) => ProxyStatus {
            running: true,
            error: None,
        },
        Err(e) => ProxyStatus {
            running: false,
            error: Some(e),
        },
    }
}
