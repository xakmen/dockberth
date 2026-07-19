//! "Report a bug" diagnostics: versions and environment facts only —
//! project COUNT and preset ids, never names or paths. The frontend shows
//! the exact block to the user before anything leaves the machine.

use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

use crate::projects::read_config;
use crate::registry;
use crate::wsl;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostics {
    pub app_version: String,
    pub tauri_version: String,
    pub windows_version: String,
    pub docker: String,
    pub wsl_distros: Vec<String>,
    pub project_count: usize,
    /// Preset ids only (e.g. ["wordpress", "laravel"]).
    pub presets: Vec<String>,
}

#[tauri::command]
pub async fn diagnostics_collect(app: AppHandle) -> Result<Diagnostics, String> {
    let windows_version = match app.shell().command("cmd").args(["/C", "ver"]).output().await {
        Ok(output) => String::from_utf8_lossy(&output.stdout).trim().to_string(),
        Err(_) => "unknown".to_string(),
    };

    let docker_status = crate::docker::docker_version(app.clone()).await;
    let docker = match (docker_status.running, docker_status.version) {
        (true, Some(v)) => format!("{v} (daemon running)"),
        (false, Some(v)) => format!("{v} (daemon not running)"),
        _ => "not found".to_string(),
    };

    let wsl_distros = wsl::wsl_list_distros(app.clone())
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|d| {
            format!(
                "{} (WSL{}{})",
                d.name,
                d.version,
                if d.is_default { ", default" } else { "" }
            )
        })
        .collect();

    let entries = registry::load_entries(&app)?;
    let mut presets: Vec<String> = entries
        .iter()
        .map(|e| {
            read_config(&e.path)
                .and_then(|c| c.preset)
                .unwrap_or("unknown".to_string())
        })
        .collect();
    presets.sort();
    presets.dedup();

    Ok(Diagnostics {
        app_version: app.package_info().version.to_string(),
        tauri_version: tauri::VERSION.to_string(),
        windows_version,
        docker,
        wsl_distros,
        project_count: entries.len(),
        presets,
    })
}
