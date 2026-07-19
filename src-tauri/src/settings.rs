//! App settings persisted in the app data dir (settings.json).
//! Loaded WITHOUT an AppHandle at startup (Sentry must init before the
//! Tauri builder runs), so the path is derived from %APPDATA% directly —
//! per-platform, like the rest of the Windows-specific modules.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// Crash reporting is strictly OPT-IN (docs/TELEMETRY.md).
    pub telemetry_enabled: bool,
    /// The one-time first-launch consent dialog was answered/dismissed.
    pub telemetry_prompted: bool,
    /// Local-domain suffix (`<name>.<suffix>`), stored without a leading
    /// dot. Changing it goes through `apply_domain_suffix` (projects.rs),
    /// which re-renders compose files and resyncs the hosts block.
    pub domain_suffix: String,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            telemetry_enabled: false,
            telemetry_prompted: false,
            domain_suffix: crate::domain::DEFAULT_SUFFIX.to_string(),
        }
    }
}

fn settings_path() -> Option<PathBuf> {
    let appdata = std::env::var_os("APPDATA")?;
    Some(PathBuf::from(appdata).join("com.dockberth.app").join("settings.json"))
}

pub fn load() -> Settings {
    let mut settings: Settings = settings_path()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default();
    // A hand-edited settings.json must not poison every domain we build.
    if !crate::domain::is_valid_domain_suffix(&settings.domain_suffix) {
        settings.domain_suffix = crate::domain::DEFAULT_SUFFIX.to_string();
    }
    settings
}

pub(crate) fn save(settings: Settings) -> Result<(), String> {
    let path = settings_path().ok_or("cannot resolve settings path")?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("cannot create app data dir: {e}"))?;
    }
    let raw = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("cannot serialize settings: {e}"))?;
    std::fs::write(&path, raw).map_err(|e| format!("cannot write settings: {e}"))
}

#[tauri::command]
pub fn settings_get() -> Settings {
    load()
}

#[tauri::command]
pub fn settings_set(settings: Settings) -> Result<(), String> {
    if !crate::domain::is_valid_domain_suffix(&settings.domain_suffix) {
        return Err(format!(
            "invalid domain suffix '{}'",
            settings.domain_suffix
        ));
    }
    save(settings)
}
