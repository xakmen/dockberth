//! Project lifecycle commands: detection, creation, start/stop/restart and
//! status polling. Composes the registry, template renderer, docker CLI
//! wrappers and hosts management.

use std::collections::HashMap;
use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

use crate::docker::{map_container_state, run_docker_checked};
use crate::hosts;
use crate::preset::{self, BaseKind, Preset};
use crate::registry::{
    self, derive_location, Database, Location, ProjectConfig, RegistryEntry,
};
use crate::template;
use crate::wsl;

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
    /// Path opened in the browser for this project (preset openPath, "/").
    pub open_url_path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectResult {
    /// Matched preset (None = unsupported folder).
    pub preset: Option<Preset>,
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

fn read_config(project_path: &str) -> Option<ProjectConfig> {
    let config_path = Path::new(project_path)
        .join(".dockberth")
        .join("config.json");
    let mut config: ProjectConfig = fs::read_to_string(config_path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())?;
    config.normalize();
    Some(config)
}

/// Location from config.json when present, else derived from the registry
/// path (backward compat with configs written before the WSL milestone).
fn effective_location(entry: &RegistryEntry, config: Option<&ProjectConfig>) -> Location {
    config
        .and_then(|c| c.location.clone())
        .unwrap_or_else(|| derive_location(&entry.path))
}

fn entry_to_info(entry: &RegistryEntry) -> ProjectInfo {
    let config = read_config(&entry.path);
    let location = effective_location(entry, config.as_ref());
    let hosts_ok =
        hosts::domain_present(&format!("{}.test", entry.name)).unwrap_or(false);
    let open_url_path = config
        .as_ref()
        .and_then(|c| c.preset.as_deref())
        .and_then(preset::find_preset)
        .and_then(|p| p.open_path.clone())
        .unwrap_or("/".to_string());
    ProjectInfo {
        name: entry.name.clone(),
        path: entry.path.clone(),
        created_at: entry.created_at,
        location,
        config,
        hosts_ok,
        open_url_path,
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
    let folder_name = dir
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    Ok(DetectResult {
        preset: preset::detect(dir).cloned(),
        suggested_name: sanitize_name(&folder_name),
        location: derive_location(&path),
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
    pub preset: String,
    #[serde(default)]
    pub php_version: Option<String>,
    #[serde(default)]
    pub node_version: Option<String>,
    #[serde(default)]
    pub db: Option<Database>,
    #[serde(default)]
    pub redis: bool,
    #[serde(default)]
    pub start_command: Option<String>,
    #[serde(default)]
    pub app_port: Option<u16>,
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
    let preset = preset::find_preset(&args.preset)
        .ok_or_else(|| format!("unknown preset '{}'", args.preset))?;

    let entries = registry::load_entries(&app)?;
    if entries.iter().any(|e| e.name == args.name) {
        return Err(format!("a project named '{}' already exists", args.name));
    }
    if entries.iter().any(|e| e.path == args.path) {
        return Err("this folder is already registered as a project".into());
    }

    let location = derive_location(&args.path);
    let mut wsl_uid_gid = None;
    if let Location::Wsl { distro, .. } = &location {
        // Reject WSL1 (bind-mount semantics differ) and unknown distros.
        let distros = wsl::wsl_list_distros(app.clone()).await?;
        match distros.iter().find(|d| &d.name == distro) {
            None => return Err(format!("WSL distro '{distro}' not found")),
            Some(d) if d.version != 2 => {
                return Err(format!(
                    "'{distro}' is a WSL1 distro — WSL2 required. \
                     Convert it with: wsl --set-version {distro} 2"
                ))
            }
            Some(_) => {}
        }
        wsl_uid_gid = Some(wsl::default_uid_gid(&app, distro).await?);
    }

    // Store resolved values so regeneration is stable even if preset
    // defaults change in a later Dockberth version.
    let has_db = args.db.or_else(|| {
        preset
            .defaults
            .db
            .as_deref()
            .and_then(|id| serde_json::from_value(serde_json::json!(id)).ok())
    });
    let config = ProjectConfig {
        name: args.name.clone(),
        preset: Some(preset.id.clone()),
        stack: None,
        base: Some(
            match preset.base {
                BaseKind::Php => "php",
                BaseKind::Node => "node",
            }
            .to_string(),
        ),
        php_version: args.php_version.or(preset.defaults.php_version.clone()),
        node_version: args.node_version.or(preset.defaults.node_version.clone()),
        db: has_db,
        redis: args.redis,
        db_name: has_db.map(|_| template::DEFAULT_DB_NAME.to_string()),
        db_user: has_db.map(|_| template::DEFAULT_DB_NAME.to_string()),
        db_password: has_db.map(|_| template::DEFAULT_DB_NAME.to_string()),
        start_command: args.start_command.or(preset.defaults.start_command.clone()),
        app_port: Some(args.app_port.unwrap_or(preset.app_port)),
        location: Some(location.clone()),
    };
    let is_wsl = wsl_uid_gid.is_some();
    let (uid, gid) = wsl_uid_gid.unwrap_or((0, 0));
    let compose = template::render_project_compose(preset, &config, is_wsl, uid, gid)?;

    let dockberth_dir = dir.join(".dockberth");
    fs::create_dir_all(&dockberth_dir)
        .map_err(|e| format!("cannot create .dockberth directory: {e}"))?;
    fs::write(dockberth_dir.join("docker-compose.yml"), compose)
        .map_err(|e| format!("cannot write docker-compose.yml: {e}"))?;
    if preset.base == BaseKind::Php {
        if template::php_needs_build(preset, is_wsl) {
            let php_version = config.php_version.as_deref().unwrap_or_default();
            let dockerfile =
                template::render_php_dockerfile(preset, php_version, is_wsl, uid, gid);
            fs::write(dockberth_dir.join("app.Dockerfile"), dockerfile)
                .map_err(|e| format!("cannot write app.Dockerfile: {e}"))?;
        }
        if !is_wsl {
            fs::write(dockberth_dir.join("php-fpm-root-run"), template::FPM_ROOT_RUN)
                .map_err(|e| format!("cannot write php-fpm-root-run: {e}"))?;
        }
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

/// Single routing point for every compose invocation:
/// NTFS → `docker compose` from Windows; WSL2 → the same command executed
/// inside the distro so bind mounts use native Linux paths.
async fn compose_exec(app: &AppHandle, name: &str, action: &[&str]) -> Result<(), String> {
    let entry = find_entry(app, name)?;
    if !Path::new(&compose_file(&entry.path)).is_file() {
        return Err("missing .dockberth/docker-compose.yml — recreate the project".into());
    }
    let config = read_config(&entry.path);
    match effective_location(&entry, config.as_ref()) {
        Location::Ntfs { windows_path } => {
            let file = compose_file(&windows_path);
            let mut args = vec!["compose", "-f", file.as_str()];
            args.extend_from_slice(action);
            run_docker_checked(app, &args).await?;
        }
        Location::Wsl { distro, linux_path } => {
            let mut args = vec!["docker", "compose", "-f", ".dockberth/docker-compose.yml"];
            args.extend_from_slice(action);
            let output =
                wsl::run_in_distro(app, &distro, Some(&linux_path), &args).await?;
            if !output.status.success() {
                return Err(format!(
                    "docker compose {} failed in {distro}: {}",
                    action.join(" "),
                    String::from_utf8_lossy(&output.stderr).trim()
                ));
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn project_start(app: AppHandle, name: String) -> Result<(), String> {
    compose_exec(&app, &name, &["up", "-d"]).await
}

#[tauri::command]
pub async fn project_stop(app: AppHandle, name: String) -> Result<(), String> {
    compose_exec(&app, &name, &["stop"]).await
}

#[tauri::command]
pub async fn project_restart(app: AppHandle, name: String) -> Result<(), String> {
    compose_exec(&app, &name, &["restart"]).await
}

/// Open the project folder in Explorer (works for UNC WSL paths too).
#[tauri::command]
pub fn project_open_folder(app: AppHandle, name: String) -> Result<(), String> {
    let entry = find_entry(&app, &name)?;
    std::process::Command::new("explorer.exe")
        .arg(&entry.path)
        .spawn()
        .map_err(|e| format!("cannot open Explorer: {e}"))?;
    Ok(())
}

/// Open the project in VS Code. WSL projects use the Remote-WSL target
/// (native-speed editing); falls back to opening the UNC path directly.
#[tauri::command]
pub async fn project_open_editor(app: AppHandle, name: String) -> Result<(), String> {
    let entry = find_entry(&app, &name)?;
    let config = read_config(&entry.path);
    let shell = app.shell();

    if let Location::Wsl { distro, linux_path } = effective_location(&entry, config.as_ref()) {
        let remote = format!("wsl+{distro}");
        let output = shell
            .command("cmd")
            .args(["/C", "code", "--remote", &remote, &linux_path])
            .output()
            .await
            .map_err(|e| format!("cannot run VS Code CLI: {e}"))?;
        if output.status.success() {
            return Ok(());
        }
    }

    let output = shell
        .command("cmd")
        .args(["/C", "code", &entry.path])
        .output()
        .await
        .map_err(|e| format!("cannot run VS Code CLI: {e}"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err("VS Code CLI ('code') not found in PATH".into())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusSnapshot {
    /// Per-project status: running | starting | stopped.
    pub projects: HashMap<String, String>,
    /// State of the dockberth-proxy container in the same `docker ps` —
    /// lets the frontend self-heal the proxy without extra polling cost.
    pub proxy_running: bool,
}

/// Coarse status for every registered project (and the proxy) in a single
/// `docker ps` call.
#[tauri::command]
pub async fn projects_status(app: AppHandle) -> Result<StatusSnapshot, String> {
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
    let mut proxy_running = false;
    for line in stdout.lines() {
        let Some((compose_project, state)) = line.split_once('|') else {
            continue;
        };
        let Some(name) = compose_project.strip_prefix("dockberth-") else {
            continue;
        };
        if name == "proxy" {
            proxy_running = state.trim() == "running";
            continue;
        }
        per_project
            .entry(name.to_string())
            .or_default()
            .push(map_container_state(state.trim()));
    }

    let projects = per_project
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
        .collect();
    Ok(StatusSnapshot {
        projects,
        proxy_running,
    })
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
