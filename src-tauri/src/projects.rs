//! Project lifecycle commands: detection, creation, start/stop/restart and
//! status polling. Composes the registry, template renderer, docker CLI
//! wrappers and hosts management.

use std::collections::HashMap;
use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::docker::{map_container_state, run_docker_checked};
use crate::hosts;
use crate::registry::{
    self, detect_location, Database, Location, ProjectConfig, RegistryEntry,
};
use crate::template;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    pub name: String,
    pub path: String,
    pub created_at: u64,
    pub location: Location,
    /// None when `.dockberth/config.json` is missing or unreadable.
    pub config: Option<ProjectConfig>,
    pub hosts_ok: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectResult {
    /// "laravel" or "unknown" (WordPress/Vendure come next).
    pub stack: String,
    pub suggested_name: String,
    pub location: Location,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceState {
    pub name: String,
    pub state: String,
    pub image: String,
}

fn compose_file(project_path: &str) -> String {
    Path::new(project_path)
        .join(".dockberth")
        .join("docker-compose.yml")
        .to_string_lossy()
        .into_owned()
}

/// Sanitize a folder name into a valid project name: lowercase, [a-z0-9-].
fn sanitize_name(raw: &str) -> String {
    let mut out = String::new();
    for c in raw.to_lowercase().chars() {
        if c.is_ascii_lowercase() || c.is_ascii_digit() {
            out.push(c);
        } else if !out.ends_with('-') && !out.is_empty() {
            out.push('-');
        }
    }
    out.trim_matches('-').to_string()
}

fn entry_to_info(entry: &RegistryEntry) -> ProjectInfo {
    let config_path = Path::new(&entry.path)
        .join(".dockberth")
        .join("config.json");
    let config = fs::read_to_string(config_path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok());
    let hosts_ok =
        hosts::domain_present(&format!("{}.test", entry.name)).unwrap_or(false);
    ProjectInfo {
        name: entry.name.clone(),
        path: entry.path.clone(),
        created_at: entry.created_at,
        location: detect_location(&entry.path),
        config,
        hosts_ok,
    }
}

fn find_entry(app: &AppHandle, name: &str) -> Result<RegistryEntry, String> {
    registry::load_entries(app)?
        .into_iter()
        .find(|e| e.name == name)
        .ok_or_else(|| format!("project '{name}' is not registered"))
}

/// Inspect a folder the user picked in the wizard.
#[tauri::command]
pub fn detect_project(path: String) -> Result<DetectResult, String> {
    let dir = Path::new(&path);
    if !dir.is_dir() {
        return Err(format!("'{path}' is not a directory"));
    }
    let stack = if dir.join("artisan").is_file() {
        "laravel"
    } else {
        "unknown"
    };
    let folder_name = dir
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    Ok(DetectResult {
        stack: stack.to_string(),
        suggested_name: sanitize_name(&folder_name),
        location: detect_location(&path),
    })
}

/// All registered projects, enriched with per-project config and hosts state.
#[tauri::command]
pub fn project_list(app: AppHandle) -> Result<Vec<ProjectInfo>, String> {
    Ok(registry::load_entries(&app)?.iter().map(entry_to_info).collect())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateArgs {
    pub path: String,
    pub name: String,
    pub php_version: String,
    pub db: Database,
    pub redis: bool,
}

/// Create a project: render compose + config into `.dockberth/`, register
/// it, and ensure the hosts entry (single UAC prompt; a decline does not
/// fail the creation — the UI offers a retry).
#[tauri::command]
pub async fn project_create(app: AppHandle, args: CreateArgs) -> Result<ProjectInfo, String> {
    if !template::is_valid_project_name(&args.name) {
        return Err(format!(
            "invalid project name '{}': use lowercase letters, digits and hyphens",
            args.name
        ));
    }
    let dir = Path::new(&args.path);
    if !dir.is_dir() {
        return Err(format!("'{}' is not a directory", args.path));
    }
    if !dir.join("artisan").is_file() {
        return Err("stack not supported yet: only Laravel projects (artisan file) for now".into());
    }

    let entries = registry::load_entries(&app)?;
    if entries.iter().any(|e| e.name == args.name) {
        return Err(format!("a project named '{}' already exists", args.name));
    }
    if entries.iter().any(|e| e.path == args.path) {
        return Err("this folder is already registered as a project".into());
    }

    let config = ProjectConfig {
        name: args.name.clone(),
        stack: "laravel".into(),
        php_version: args.php_version.clone(),
        db: args.db,
        redis: args.redis,
    };
    let ntfs_root = detect_location(&args.path) == Location::Ntfs;
    let compose = template::render_laravel_compose(&config, ntfs_root)?;

    let dockberth_dir = dir.join(".dockberth");
    fs::create_dir_all(&dockberth_dir)
        .map_err(|e| format!("cannot create .dockberth directory: {e}"))?;
    fs::write(dockberth_dir.join("docker-compose.yml"), compose)
        .map_err(|e| format!("cannot write docker-compose.yml: {e}"))?;
    if ntfs_root {
        fs::write(dockberth_dir.join("php-fpm-root-run"), template::FPM_ROOT_RUN)
            .map_err(|e| format!("cannot write php-fpm-root-run: {e}"))?;
    }
    let config_json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("cannot serialize config: {e}"))?;
    fs::write(dockberth_dir.join("config.json"), config_json)
        .map_err(|e| format!("cannot write config.json: {e}"))?;

    let mut entries = entries;
    let entry = RegistryEntry {
        name: args.name.clone(),
        path: args.path.clone(),
        created_at: registry::now_millis(),
    };
    entries.push(entry.clone());
    registry::save_entries(&app, entries)?;

    // Hosts entry — best-effort; hosts_ok=false surfaces a retry banner.
    let _ = hosts::hosts_ensure(format!("{}.test", args.name)).await;

    Ok(entry_to_info(&entry))
}

async fn compose_action(app: &AppHandle, name: &str, action: &[&str]) -> Result<(), String> {
    let entry = find_entry(app, name)?;
    if detect_location(&entry.path) != Location::Ntfs {
        // TODO(wsl.rs): run compose inside the distro via
        // `wsl.exe -d <distro> --cd <path>` instead of rejecting.
        return Err("WSL projects coming soon".into());
    }
    let file = compose_file(&entry.path);
    if !Path::new(&file).is_file() {
        return Err("missing .dockberth/docker-compose.yml — recreate the project".into());
    }
    let mut args = vec!["compose", "-f", file.as_str()];
    args.extend_from_slice(action);
    run_docker_checked(app, &args).await?;
    Ok(())
}

#[tauri::command]
pub async fn project_start(app: AppHandle, name: String) -> Result<(), String> {
    compose_action(&app, &name, &["up", "-d"]).await
}

#[tauri::command]
pub async fn project_stop(app: AppHandle, name: String) -> Result<(), String> {
    compose_action(&app, &name, &["stop"]).await
}

#[tauri::command]
pub async fn project_restart(app: AppHandle, name: String) -> Result<(), String> {
    compose_action(&app, &name, &["restart"]).await
}

/// Coarse status for every registered project in a single `docker ps` call,
/// keyed by project name: running | starting | stopped.
#[tauri::command]
pub async fn projects_status(app: AppHandle) -> Result<HashMap<String, String>, String> {
    let stdout = run_docker_checked(
        &app,
        &[
            "ps",
            "-a",
            "--filter",
            "label=com.docker.compose.project",
            "--format",
            "{{.Label \"com.docker.compose.project\"}}|{{.State}}",
        ],
    )
    .await?;

    let mut per_project: HashMap<String, Vec<&'static str>> = HashMap::new();
    for line in stdout.lines() {
        let Some((compose_project, state)) = line.split_once('|') else {
            continue;
        };
        let Some(name) = compose_project.strip_prefix("dockberth-") else {
            continue;
        };
        if name == "proxy" {
            continue;
        }
        per_project
            .entry(name.to_string())
            .or_default()
            .push(map_container_state(state.trim()));
    }

    Ok(per_project
        .into_iter()
        .map(|(name, states)| {
            let status = if states.iter().all(|s| *s == "running") {
                "running"
            } else if states.iter().all(|s| *s == "stopped") {
                "stopped"
            } else {
                "starting"
            };
            (name, status.to_string())
        })
        .collect())
}

/// Per-service container states for one project (Services card).
#[tauri::command]
pub async fn project_services(app: AppHandle, name: String) -> Result<Vec<ServiceState>, String> {
    if !template::is_valid_project_name(&name) {
        return Err(format!("invalid project name '{name}'"));
    }
    let filter = format!("label=com.docker.compose.project=dockberth-{name}");
    let stdout = run_docker_checked(
        &app,
        &[
            "ps",
            "-a",
            "--filter",
            &filter,
            "--format",
            "{{.Label \"com.docker.compose.service\"}}|{{.State}}|{{.Image}}",
        ],
    )
    .await?;

    let mut services: Vec<ServiceState> = stdout
        .lines()
        .filter_map(|line| {
            let mut parts = line.splitn(3, '|');
            Some(ServiceState {
                name: parts.next()?.to_string(),
                state: map_container_state(parts.next()?.trim()).to_string(),
                image: parts.next().unwrap_or("").to_string(),
            })
        })
        .collect();
    services.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(services)
}
