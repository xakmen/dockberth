//! Framework presets: small typed JSON files that specialize the base
//! compose templates (templates/php, templates/node). Adding a framework
//! means adding a preset file — see docs/PRESETS.md.

use std::path::Path;
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum BaseKind {
    Php,
    Node,
}

/// How a preset recognizes a project folder.
#[derive(Serialize, Deserialize, Clone)]
#[serde(untagged)]
pub enum Detect {
    /// All listed files must exist in the project root.
    #[serde(rename_all = "camelCase")]
    Files { files: Vec<String> },
    /// package.json must exist and contain any of the listed dependencies
    /// (dependencies or devDependencies). An empty list matches any folder
    /// that has a package.json.
    #[serde(rename_all = "camelCase")]
    PackageJsonDeps { package_json_deps: Vec<String> },
}

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct PresetDefaults {
    pub php_version: Option<String>,
    pub node_version: Option<String>,
    /// Concrete database id ("mariadb-11" | "mysql-8.4" | "postgres-16");
    /// absent = no database service by default.
    pub db: Option<String>,
    pub redis: Option<bool>,
    pub start_command: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Preset {
    pub id: String,
    pub display_name: String,
    pub base: BaseKind,
    pub detect: Detect,
    /// PHP base only: web root relative to the project ("." = project root).
    #[serde(default)]
    pub docroot: Option<String>,
    #[serde(default)]
    pub defaults: PresetDefaults,
    /// Container port Traefik routes to (config.json may override it).
    pub app_port: u16,
    /// Optional services toggled on in the base compose (section markers).
    #[serde(default)]
    pub extra_services: Vec<String>,
    /// PHP base only: extra PHP extensions baked into the app image via
    /// install-php-extensions (e.g. WordPress needs mysqli).
    #[serde(default)]
    pub php_extensions: Vec<String>,
    /// Shown in the new-project dialog after detection.
    #[serde(default)]
    pub notes: Option<String>,
    /// Path appended to http://<name>.test when opening the project in a
    /// browser (Vendure's admin lives at /dashboard). Default "/".
    #[serde(default)]
    pub open_path: Option<String>,
}

/// Embedded presets in DETECTION PRECEDENCE order: specific markers
/// (artisan, wp-settings.php, a scoped dependency) before the generic
/// package.json catch-all.
const PRESET_SOURCES: [&str; 4] = [
    include_str!("../../templates/php/presets/laravel.json"),
    include_str!("../../templates/php/presets/wordpress.json"),
    include_str!("../../templates/node/presets/vendure.json"),
    include_str!("../../templates/node/presets/node-generic.json"),
];

pub fn all_presets() -> &'static [Preset] {
    static PRESETS: OnceLock<Vec<Preset>> = OnceLock::new();
    PRESETS.get_or_init(|| {
        PRESET_SOURCES
            .iter()
            .map(|raw| serde_json::from_str(raw).expect("invalid embedded preset JSON"))
            .collect()
    })
}

pub fn find_preset(id: &str) -> Option<&'static Preset> {
    all_presets().iter().find(|p| p.id == id)
}

fn package_json_has_dep(dir: &Path, deps: &[String]) -> bool {
    let Ok(raw) = std::fs::read_to_string(dir.join("package.json")) else {
        return false;
    };
    let Ok(json) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return false;
    };
    if deps.is_empty() {
        return true;
    }
    deps.iter().any(|dep| {
        json["dependencies"].get(dep).is_some() || json["devDependencies"].get(dep).is_some()
    })
}

fn matches(preset: &Preset, dir: &Path) -> bool {
    match &preset.detect {
        Detect::Files { files } => files.iter().all(|f| dir.join(f).exists()),
        Detect::PackageJsonDeps { package_json_deps } => {
            package_json_has_dep(dir, package_json_deps)
        }
    }
}

/// First matching preset in precedence order, or None for unknown folders.
pub fn detect(dir: &Path) -> Option<&'static Preset> {
    all_presets().iter().find(|p| matches(p, dir))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("dockberth-preset-test-{name}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn embedded_presets_parse_in_precedence_order() {
        let ids: Vec<&str> = all_presets().iter().map(|p| p.id.as_str()).collect();
        assert_eq!(ids, ["laravel", "wordpress", "vendure", "node-generic"]);
        assert_eq!(find_preset("wordpress").unwrap().extra_services, ["wpcli"]);
        assert_eq!(find_preset("laravel").unwrap().docroot.as_deref(), Some("public"));
        assert_eq!(find_preset("vendure").unwrap().app_port, 3000);
    }

    #[test]
    fn detects_laravel_before_generic_node() {
        // A Laravel app with a package.json (typical: vite) must resolve to
        // laravel, not node-generic.
        let dir = temp_dir("laravel");
        fs::write(dir.join("artisan"), "").unwrap();
        fs::write(dir.join("package.json"), r#"{"devDependencies":{"vite":"^5"}}"#).unwrap();
        assert_eq!(detect(&dir).unwrap().id, "laravel");
    }

    #[test]
    fn detects_wordpress_by_core_file() {
        let dir = temp_dir("wp");
        fs::write(dir.join("wp-settings.php"), "").unwrap();
        assert_eq!(detect(&dir).unwrap().id, "wordpress");
    }

    #[test]
    fn detects_vendure_before_generic_by_dependency() {
        let dir = temp_dir("vendure");
        fs::write(
            dir.join("package.json"),
            r#"{"dependencies":{"@vendure/core":"^3.0.0","express":"^4"}}"#,
        )
        .unwrap();
        assert_eq!(detect(&dir).unwrap().id, "vendure");
    }

    #[test]
    fn plain_package_json_falls_back_to_node_generic() {
        let dir = temp_dir("generic");
        fs::write(dir.join("package.json"), r#"{"dependencies":{"express":"^4"}}"#).unwrap();
        assert_eq!(detect(&dir).unwrap().id, "node-generic");
    }

    #[test]
    fn unknown_folder_detects_nothing() {
        let dir = temp_dir("unknown");
        fs::write(dir.join("README.md"), "hello").unwrap();
        assert!(detect(&dir).is_none());
    }
}
