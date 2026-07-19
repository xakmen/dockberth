//! Project registry — persisted as JSON in the Tauri app data directory.
//!
//! The registry stores only identity (name, path, createdAt). Per-project
//! settings live in `<project>/.dockberth/config.json`, which is the source
//! of truth for compose regeneration.

use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum Database {
    #[serde(rename = "mariadb-11")]
    Mariadb11,
    #[serde(rename = "mysql-8.4")]
    Mysql84,
    #[serde(rename = "postgres-16")]
    Postgres16,
}

impl Database {
    pub fn image(&self) -> &'static str {
        match self {
            Database::Mariadb11 => "mariadb:11",
            Database::Mysql84 => "mysql:8.4",
            Database::Postgres16 => "postgres:16",
        }
    }

    pub fn is_postgres(&self) -> bool {
        matches!(self, Database::Postgres16)
    }
}

/// Project settings written to `<project>/.dockberth/config.json` — the
/// source of truth for compose regeneration. Most fields are optional so
/// configs written by older Dockberth versions keep parsing; see
/// `normalize()` for the legacy migrations.
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectConfig {
    pub name: String,
    /// Preset id (docs/PRESETS.md). Inferred from `stack` on legacy configs.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preset: Option<String>,
    /// Legacy pre-preset field ("laravel"); kept for migration only.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stack: Option<String>,
    /// Base template id ("php" | "node"), denormalized for the UI.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub php_version: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub node_version: Option<String>,
    /// None = no database service.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub db: Option<Database>,
    #[serde(default)]
    pub redis: bool,
    /// DB credentials as rendered into the compose file. Legacy configs
    /// (pre-preset) rendered "laravel" for all three — the UI falls back
    /// to that when these are absent.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub db_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub db_user: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub db_password: Option<String>,
    /// Node base only.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start_command: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub app_port: Option<u16>,
    /// Where the project lives. Optional for configs written before the
    /// WSL milestone — derived from the registry path when absent.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub location: Option<Location>,
}

impl ProjectConfig {
    /// Migrate legacy fields in place: pre-preset configs carried
    /// stack="laravel" and no preset/base.
    pub fn normalize(&mut self) {
        if self.preset.is_none() {
            if let Some(stack) = &self.stack {
                if crate::preset::find_preset(stack).is_some() {
                    self.preset = Some(stack.clone());
                }
            }
        }
        if self.base.is_none() {
            if let Some(preset) = self.preset.as_deref().and_then(crate::preset::find_preset) {
                self.base = Some(
                    match preset.base {
                        crate::preset::BaseKind::Php => "php",
                        crate::preset::BaseKind::Node => "node",
                    }
                    .to_string(),
                );
            }
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RegistryEntry {
    pub name: String,
    pub path: String,
    /// Unix epoch milliseconds.
    pub created_at: u64,
}

#[derive(Serialize, Deserialize, Default)]
struct RegistryFile {
    projects: Vec<RegistryEntry>,
}

/// Where the project lives — drives the WSL2-vs-NTFS execution split.
#[derive(Serialize, Deserialize, Clone, PartialEq)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Location {
    #[serde(rename_all = "camelCase")]
    Wsl { distro: String, linux_path: String },
    #[serde(rename_all = "camelCase")]
    Ntfs { windows_path: String },
}

/// Derive a location from a Windows-side path (UNC → WSL, otherwise NTFS).
pub fn derive_location(path: &str) -> Location {
    match crate::wsl::parse_unc(path) {
        Some((distro, linux_path)) => Location::Wsl { distro, linux_path },
        None => Location::Ntfs {
            windows_path: path.to_string(),
        },
    }
}

fn registry_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("cannot resolve app data dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("cannot create app data dir: {e}"))?;
    Ok(dir.join("projects.json"))
}

pub fn load_entries(app: &AppHandle) -> Result<Vec<RegistryEntry>, String> {
    let path = registry_path(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("cannot read registry: {e}"))?;
    let file: RegistryFile =
        serde_json::from_str(&raw).map_err(|e| format!("registry is corrupted: {e}"))?;
    Ok(file.projects)
}

pub fn save_entries(app: &AppHandle, projects: Vec<RegistryEntry>) -> Result<(), String> {
    let path = registry_path(app)?;
    let raw = serde_json::to_string_pretty(&RegistryFile { projects })
        .map_err(|e| format!("cannot serialize registry: {e}"))?;
    fs::write(&path, raw).map_err(|e| format!("cannot write registry: {e}"))
}

pub fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_pre_preset_config_migrates() {
        // Exact shape written by the pre-preset milestones (harbor-test).
        let raw = r#"{
            "name": "harbor-test",
            "stack": "laravel",
            "phpVersion": "8.4",
            "db": "mariadb-11",
            "redis": true
        }"#;
        let mut config: ProjectConfig = serde_json::from_str(raw).unwrap();
        config.normalize();
        assert_eq!(config.preset.as_deref(), Some("laravel"));
        assert_eq!(config.base.as_deref(), Some("php"));
        assert_eq!(config.php_version.as_deref(), Some("8.4"));
        assert_eq!(config.db, Some(Database::Mariadb11));
        assert!(config.db_name.is_none()); // UI falls back to "laravel"
    }
}
