//! Minimal typed template renderer for the compose templates in templates/.
//!
//! Two constructs, nothing more:
//! - `{placeholder}` — replaced with a value
//! - `#[section:name]` … `#[/section]` line markers — the enclosed lines are
//!   kept or dropped depending on the project configuration
//!
//! Templates are embedded at compile time so the app binary is
//! self-contained; the files in templates/ remain the source of truth.

use crate::registry::ProjectConfig;

const LARAVEL_TEMPLATE: &str = include_str!("../../templates/laravel/docker-compose.yml");
const PROXY_TEMPLATE: &str = include_str!("../../templates/proxy/docker-compose.yml");

pub const SUPPORTED_PHP_VERSIONS: [&str; 4] = ["8.1", "8.2", "8.3", "8.4"];

/// `true` for names that are safe as compose project names, hostnames and
/// hosts-file entries: lowercase, digits, hyphens, must start alphanumeric.
pub fn is_valid_project_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 63
        && name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        && !name.starts_with('-')
        && !name.ends_with('-')
}

fn render(template: &str, vars: &[(&str, &str)], sections: &[(&str, bool)]) -> String {
    let mut out = String::new();
    let mut skipping = false;

    for line in template.lines() {
        let trimmed = line.trim();
        if let Some(name) = trimmed.strip_prefix("#[section:").and_then(|s| s.strip_suffix(']')) {
            skipping = !sections
                .iter()
                .find(|(n, _)| *n == name)
                .map(|(_, enabled)| *enabled)
                .unwrap_or(false);
            continue;
        }
        if trimmed == "#[/section]" {
            skipping = false;
            continue;
        }
        if !skipping {
            out.push_str(line);
            out.push('\n');
        }
    }

    for (key, value) in vars {
        out = out.replace(&format!("{{{key}}}"), value);
    }
    out
}

/// php-fpm s6 run script mounted over the image's one for NTFS projects:
/// identical to upstream plus --allow-to-run-as-root (see the template).
pub const FPM_ROOT_RUN: &str = "#!/command/execlineb -P\nwith-contenv\ns6-notifyoncheck -d\n/usr/local/sbin/php-fpm --nodaemonize --allow-to-run-as-root\n";

/// Render the Laravel compose file for a validated project configuration.
/// `ntfs_root` enables the run-as-root override needed on NTFS bind mounts.
pub fn render_laravel_compose(config: &ProjectConfig, ntfs_root: bool) -> Result<String, String> {
    if !is_valid_project_name(&config.name) {
        return Err(format!(
            "invalid project name '{}': use lowercase letters, digits and hyphens",
            config.name
        ));
    }
    if !SUPPORTED_PHP_VERSIONS.contains(&config.php_version.as_str()) {
        return Err(format!("unsupported PHP version '{}'", config.php_version));
    }

    Ok(render(
        LARAVEL_TEMPLATE,
        &[
            ("project", config.name.as_str()),
            ("php_version", config.php_version.as_str()),
            ("db_image", config.db.image()),
            ("db_name", "laravel"),
        ],
        &[
            ("db_mysql", !config.db.is_postgres()),
            ("db_postgres", config.db.is_postgres()),
            ("redis", config.redis),
            ("ntfs_root", ntfs_root),
        ],
    ))
}

/// The proxy compose file has no placeholders; expose it for proxy.rs.
pub fn proxy_compose() -> &'static str {
    PROXY_TEMPLATE
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::registry::Database;

    fn config(db: Database, redis: bool) -> ProjectConfig {
        ProjectConfig {
            name: "aquashop".into(),
            stack: "laravel".into(),
            php_version: "8.3".into(),
            db,
            redis,
        }
    }

    #[test]
    fn renders_mariadb_with_redis() {
        let out = render_laravel_compose(&config(Database::Mariadb11, true), true).unwrap();
        assert!(out.contains("user: root"));
        assert!(out.contains("php-fpm-root-run"));
        assert!(out.contains("name: dockberth-aquashop"));
        assert!(out.contains("image: serversideup/php:8.3-fpm-nginx"));
        assert!(out.contains("image: mariadb:11"));
        assert!(out.contains("MYSQL_DATABASE: laravel"));
        assert!(!out.contains("POSTGRES_DB"));
        assert!(out.contains("image: redis:7-alpine"));
        assert!(out.contains("Host(`aquashop.test`)"));
        assert!(out.contains("name: dockberth-aquashop-db"));
        assert!(!out.contains("#[section"));
        assert!(!out.contains("{project}"));
    }

    #[test]
    fn renders_postgres_without_redis() {
        let out = render_laravel_compose(&config(Database::Postgres16, false), false).unwrap();
        assert!(out.contains("image: postgres:16"));
        assert!(out.contains("POSTGRES_DB: laravel"));
        assert!(!out.contains("MYSQL_DATABASE"));
        assert!(!out.contains("redis:7-alpine"));
        assert!(!out.contains("user: root"));
        assert!(!out.contains("php-fpm-root-run"));
    }

    #[test]
    fn rejects_bad_input() {
        let mut bad = config(Database::Mysql84, false);
        bad.name = "Aqua Shop".into();
        assert!(render_laravel_compose(&bad, false).is_err());

        let mut bad_php = config(Database::Mysql84, false);
        bad_php.php_version = "7.4".into();
        assert!(render_laravel_compose(&bad_php, false).is_err());
    }
}
