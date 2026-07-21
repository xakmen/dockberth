//! Minimal typed template renderer for the base compose templates in
//! templates/ (php, node, proxy), specialized by framework presets.
//!
//! Two constructs, nothing more:
//! - `{placeholder}` — replaced with a value
//! - `#[section:name]` … `#[/section]` line markers (nestable) — the
//!   enclosed lines are kept or dropped depending on the configuration
//!
//! Templates are embedded at compile time so the app binary is
//! self-contained; the files in templates/ remain the source of truth.

use crate::preset::{BaseKind, Preset};
use crate::registry::{Database, ProjectConfig};

const PHP_TEMPLATE: &str = include_str!("../../templates/php/docker-compose.yml");
const PHP_DOCKERFILE: &str = include_str!("../../templates/php/app.Dockerfile");
const NODE_TEMPLATE: &str = include_str!("../../templates/node/docker-compose.yml");
const PROXY_TEMPLATE: &str = include_str!("../../templates/proxy/docker-compose.yml");

pub const SUPPORTED_PHP_VERSIONS: [&str; 4] = ["8.1", "8.2", "8.3", "8.4"];
pub const SUPPORTED_NODE_VERSIONS: [&str; 2] = ["20", "22"];

/// Default DB credentials written into new configs (the Database card
/// mirrors whatever config.json says, so legacy projects keep theirs).
pub const DEFAULT_DB_NAME: &str = "app";

/// `true` for names that are safe as compose project names, hostnames and
/// hosts-file entries: lowercase, digits, hyphens, must start alphanumeric.
pub fn is_valid_project_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 63
        && name.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        && !name.starts_with('-')
        && !name.ends_with('-')
}

/// `true` for names Dockberth reserves for its own compose projects: the
/// global proxy renders as `dockberth-proxy`, so a project named `proxy`
/// (project `dockberth-proxy`) would share that compose project and could
/// take Traefik down. Anything under the `dockberth` prefix is reserved
/// too, keeping the `dockberth-*` namespace ours (scaffold, future stacks).
pub fn is_reserved_project_name(name: &str) -> bool {
    name == "proxy" || name.starts_with("dockberth")
}

/// Safe for an unquoted YAML scalar (DB name / user / password). Rejects
/// whitespace, newlines and YAML-structural characters; the default value
/// is "app", and hand-edited configs must stay within this set.
fn is_safe_db_value(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.'))
}

/// Escape `$` as `$$` so docker-compose's `${VAR}` / `$VAR` interpolation
/// treats the value literally (compose un-escapes `$$` back to a single
/// `$`). Applied to user-controlled scalars rendered into the compose
/// file; without it a start command like `PORT=$PORT npm run dev` had
/// `$PORT` substituted from the host environment (usually empty) before
/// the container ever saw it.
fn escape_compose_dollar(value: &str) -> String {
    value.replace('$', "$$")
}

/// php-fpm s6 run script mounted over the image's one for NTFS projects:
/// identical to upstream plus --allow-to-run-as-root (see the php base).
pub const FPM_ROOT_RUN: &str = "#!/command/execlineb -P\nwith-contenv\ns6-notifyoncheck -d\n/usr/local/sbin/php-fpm --nodaemonize --allow-to-run-as-root\n";

fn render(template: &str, vars: &[(&str, &str)], sections: &[(&str, bool)]) -> String {
    let mut out = String::new();
    // Stack of include-states; sections nest (e.g. ntfs_root inside wpcli).
    let mut stack: Vec<bool> = Vec::new();

    for line in template.lines() {
        let trimmed = line.trim();
        if let Some(name) = trimmed.strip_prefix("#[section:").and_then(|s| s.strip_suffix(']')) {
            let parent = stack.last().copied().unwrap_or(true);
            let enabled = sections
                .iter()
                .find(|(n, _)| *n == name)
                .map(|(_, on)| *on)
                .unwrap_or(false);
            stack.push(parent && enabled);
            continue;
        }
        if trimmed == "#[/section]" {
            stack.pop();
            continue;
        }
        if stack.last().copied().unwrap_or(true) {
            out.push_str(line);
            out.push('\n');
        }
    }

    for (key, value) in vars {
        out = out.replace(&format!("{{{key}}}"), value);
    }
    out
}

struct Resolved {
    app_port: String,
    db: Option<Database>,
    db_name: String,
    db_user: String,
    db_password: String,
    uid: String,
    gid: String,
}

fn resolve_common(config: &ProjectConfig, preset: &Preset, uid: u32, gid: u32) -> Resolved {
    Resolved {
        app_port: config.app_port.unwrap_or(preset.app_port).to_string(),
        db: config.db,
        // Escaped so a `$` in a (hand-edited) credential is passed to the
        // container literally instead of being interpolated by compose.
        db_name: escape_compose_dollar(&config.db_name.clone().unwrap_or(DEFAULT_DB_NAME.into())),
        db_user: escape_compose_dollar(&config.db_user.clone().unwrap_or(DEFAULT_DB_NAME.into())),
        db_password: escape_compose_dollar(
            &config.db_password.clone().unwrap_or(DEFAULT_DB_NAME.into()),
        ),
        uid: uid.to_string(),
        gid: gid.to_string(),
    }
}

/// Render the compose file for a project. `domain` is the full routed
/// domain (`domain::project_domain`, e.g. "shop.test"); `wsl` selects the
/// unprivileged WSL variant; `uid`/`gid` are the distro user's ids
/// (ignored for NTFS).
pub fn render_project_compose(
    preset: &Preset,
    config: &ProjectConfig,
    domain: &str,
    wsl: bool,
    uid: u32,
    gid: u32,
) -> Result<String, String> {
    if !is_valid_project_name(&config.name) {
        return Err(format!(
            "invalid project name '{}': use lowercase letters, digits and hyphens",
            config.name
        ));
    }
    // DB credentials are rendered into unquoted YAML scalars, so a hand-
    // edited config.json with a value like "x\n  volumes: ..." could inject
    // compose structure. Restrict to a safe charset (the default is "app").
    for (label, value) in [
        ("db name", &config.db_name),
        ("db user", &config.db_user),
        ("db password", &config.db_password),
    ] {
        if let Some(value) = value {
            if !is_safe_db_value(value) {
                return Err(format!(
                    "invalid {label}: use letters, digits, '_', '-' or '.' (1-64 chars)"
                ));
            }
        }
    }
    let r = resolve_common(config, preset, uid, gid);
    let db_image = r.db.map(|d| d.image()).unwrap_or_default();
    let has_section = |name: &str| preset.extra_services.iter().any(|s| s == name);

    match preset.base {
        BaseKind::Php => {
            let php_version = config
                .php_version
                .clone()
                .or(preset.defaults.php_version.clone())
                .ok_or("PHP version is not set")?;
            if !SUPPORTED_PHP_VERSIONS.contains(&php_version.as_str()) {
                return Err(format!("unsupported PHP version '{php_version}'"));
            }
            let db = r.db.ok_or("PHP projects require a database")?;
            let docroot = preset
                .docroot
                .clone()
                .ok_or(format!("preset '{}' is missing docroot", preset.id))?;
            let webroot = if docroot == "." {
                "/var/www/html".to_string()
            } else {
                format!("/var/www/html/{docroot}")
            };
            let needs_build = php_needs_build(preset, wsl);
            Ok(render(
                PHP_TEMPLATE,
                &[
                    ("project", config.name.as_str()),
                    ("domain", domain),
                    ("php_version", php_version.as_str()),
                    ("webroot", webroot.as_str()),
                    ("app_port", r.app_port.as_str()),
                    ("db_image", db_image),
                    ("db_name", r.db_name.as_str()),
                    ("db_user", r.db_user.as_str()),
                    ("db_password", r.db_password.as_str()),
                    ("uid", r.uid.as_str()),
                    ("gid", r.gid.as_str()),
                ],
                &[
                    ("db_mysql", !db.is_postgres()),
                    ("db_postgres", db.is_postgres()),
                    ("redis", config.redis),
                    ("mailpit", has_section("mailpit")),
                    ("adminer", has_section("adminer")),
                    ("wpcli", has_section("wpcli")),
                    ("ntfs_root", !wsl),
                    ("stock_image", !needs_build),
                    ("app_build", needs_build),
                    ("wsl_user", wsl),
                ],
            ))
        }
        BaseKind::Node => {
            let node_version = config
                .node_version
                .clone()
                .or(preset.defaults.node_version.clone())
                .ok_or("Node version is not set")?;
            if !SUPPORTED_NODE_VERSIONS.contains(&node_version.as_str()) {
                return Err(format!("unsupported Node version '{node_version}'"));
            }
            let start_command = config
                .start_command
                .clone()
                .or(preset.defaults.start_command.clone())
                .unwrap_or("npm run dev".to_string());
            if start_command.contains(['"', '\\', '\n', '\r']) {
                return Err(
                    "start command must not contain quotes, backslashes or newlines".into(),
                );
            }
            let start_command = escape_compose_dollar(&start_command);
            Ok(render(
                NODE_TEMPLATE,
                &[
                    ("project", config.name.as_str()),
                    ("domain", domain),
                    ("node_version", node_version.as_str()),
                    ("start_command", start_command.as_str()),
                    ("app_port", r.app_port.as_str()),
                    ("db_image", db_image),
                    ("db_name", r.db_name.as_str()),
                    ("db_user", r.db_user.as_str()),
                    ("db_password", r.db_password.as_str()),
                    ("uid", r.uid.as_str()),
                    ("gid", r.gid.as_str()),
                ],
                &[
                    ("db", r.db.is_some()),
                    ("db_mysql", r.db.map(|d| !d.is_postgres()).unwrap_or(false)),
                    ("db_postgres", r.db.map(|d| d.is_postgres()).unwrap_or(false)),
                    ("redis", config.redis),
                    ("node_modules_overlay", !wsl),
                    ("wsl_user", wsl),
                ],
            ))
        }
    }
}

/// True when the PHP app image must be built locally instead of pulled:
/// WSL2 (UID remap) and/or preset-declared extra PHP extensions.
pub fn php_needs_build(preset: &Preset, wsl: bool) -> bool {
    wsl || !preset.php_extensions.is_empty()
}

/// Render the app.Dockerfile for PHP projects that need a local build
/// (extra extensions and/or the WSL2 www-data UID remap).
pub fn render_php_dockerfile(preset: &Preset, php_version: &str, wsl: bool, uid: u32, gid: u32) -> String {
    let extensions = preset.php_extensions.join(" ");
    render(
        PHP_DOCKERFILE,
        &[
            ("php_version", php_version),
            ("php_extensions", extensions.as_str()),
            ("uid", uid.to_string().as_str()),
            ("gid", gid.to_string().as_str()),
        ],
        &[
            ("php_extensions", !preset.php_extensions.is_empty()),
            ("wsl_ids", wsl),
        ],
    )
}

/// The proxy compose file has no placeholders; expose it for proxy.rs.
pub fn proxy_compose() -> &'static str {
    PROXY_TEMPLATE
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::preset::find_preset;

    fn config(preset: &str, db: Option<Database>, redis: bool) -> ProjectConfig {
        ProjectConfig {
            name: "aquashop".into(),
            preset: Some(preset.into()),
            stack: None,
            base: None,
            php_version: None,
            node_version: None,
            db,
            redis,
            db_name: None,
            db_user: None,
            db_password: None,
            start_command: None,
            app_port: None,
            location: None,
        }
    }

    #[test]
    fn renders_laravel_ntfs_with_root_workaround() {
        let preset = find_preset("laravel").unwrap();
        let cfg = config("laravel", Some(Database::Mariadb11), true);
        let out = render_project_compose(preset, &cfg, "aquashop.test", false, 0, 0).unwrap();
        assert!(out.contains("name: dockberth-aquashop"));
        assert!(out.contains("rule: Host(`aquashop.test`)"));
        assert!(out.contains("image: serversideup/php:8.3-fpm-nginx"));
        assert!(out.contains("NGINX_WEBROOT: /var/www/html/public"));
        assert!(out.contains("user: root"));
        assert!(out.contains("php-fpm-root-run"));
        assert!(out.contains("image: mariadb:11"));
        assert!(out.contains("MYSQL_DATABASE: app"));
        assert!(out.contains("image: redis:7-alpine"));
        assert!(out.contains("server.port: \"8080\""));
        assert!(!out.contains("wpcli"));
        assert!(!out.contains("build:"));
        assert!(!out.contains("#[section"));
        assert!(!out.contains("{project}"));
    }

    #[test]
    fn renders_wordpress_wsl_with_wpcli_and_root_docroot() {
        let preset = find_preset("wordpress").unwrap();
        let cfg = config("wordpress", Some(Database::Mariadb11), false);
        let out =
            render_project_compose(preset, &cfg, "aquashop.dev.mycompany", true, 1000, 1000)
                .unwrap();
        assert!(out.contains("NGINX_WEBROOT: /var/www/html\n"));
        // Custom suffix lands verbatim in the Traefik rule.
        assert!(out.contains("rule: Host(`aquashop.dev.mycompany`)"));
        assert!(out.contains("wpcli:"));
        assert!(out.contains("image: wordpress:cli"));
        assert!(out.contains("profiles: [\"tools\"]"));
        assert!(out.contains("user: \"1000:1000\""));
        assert!(out.contains("dockerfile: app.Dockerfile"));
        // The NTFS-only root workaround must not leak into WSL renders,
        // including the nested section inside wpcli.
        assert!(!out.contains("user: root"));
        assert!(!out.contains("php-fpm-root-run"));
        assert!(!out.contains("redis"));
    }

    #[test]
    fn renders_vendure_wsl_with_postgres() {
        let preset = find_preset("vendure").unwrap();
        let cfg = config("vendure", Some(Database::Postgres16), false);
        let out = render_project_compose(preset, &cfg, "aquashop.test", true, 1000, 1000).unwrap();
        assert!(out.contains("rule: Host(`aquashop.test`)"));
        assert!(out.contains("image: node:22-bookworm-slim"));
        assert!(out.contains("command: [\"sh\", \"-lc\", \"npm run dev\"]"));
        assert!(out.contains("image: postgres:16"));
        assert!(out.contains("POSTGRES_DB: app"));
        assert!(out.contains("server.port: \"3000\""));
        assert!(out.contains("user: \"1000:1000\""));
        // WSL: no overlay — node_modules binds straight through.
        assert!(!out.contains("/app/node_modules"));
        assert!(!out.contains("MYSQL_DATABASE"));
    }

    #[test]
    fn renders_node_generic_ntfs_with_overlay_no_db() {
        let preset = find_preset("node-generic").unwrap();
        let mut cfg = config("node-generic", None, false);
        cfg.start_command = Some("npm install && node server.js".into());
        cfg.app_port = Some(4173);
        let out = render_project_compose(preset, &cfg, "node-generic.test", false, 0, 0).unwrap();
        assert!(out.contains("- /app/node_modules"));
        assert!(out.contains("npm install && node server.js"));
        assert!(out.contains("server.port: \"4173\""));
        assert!(!out.contains("db:"));
        assert!(!out.contains("depends_on"));
        assert!(!out.contains("db-data"));
        assert!(!out.contains("user:"));
        assert!(!out.contains("#[section"));
    }

    #[test]
    fn reserves_dockberth_owned_names() {
        assert!(is_reserved_project_name("proxy"));
        assert!(is_reserved_project_name("dockberth"));
        assert!(is_reserved_project_name("dockberth-proxy"));
        assert!(is_reserved_project_name("dockberthx"));
        // Legitimate project names are not reserved.
        assert!(!is_reserved_project_name("shop"));
        assert!(!is_reserved_project_name("my-proxy"));
        assert!(!is_reserved_project_name("proxied"));
        assert!(!is_reserved_project_name("berth"));
    }

    #[test]
    fn rejects_bad_input() {
        let preset = find_preset("laravel").unwrap();
        let mut bad = config("laravel", Some(Database::Mysql84), false);
        bad.name = "Aqua Shop".into();
        assert!(render_project_compose(preset, &bad, "x.test", false, 0, 0).is_err());

        let mut bad_php = config("laravel", Some(Database::Mysql84), false);
        bad_php.php_version = Some("7.4".into());
        assert!(render_project_compose(preset, &bad_php, "x.test", false, 0, 0).is_err());

        let no_db = config("laravel", None, false);
        assert!(render_project_compose(preset, &no_db, "x.test", false, 0, 0).is_err());

        let node = find_preset("node-generic").unwrap();
        let mut bad_cmd = config("node-generic", None, false);
        bad_cmd.start_command = Some("echo \"hi\"".into());
        assert!(render_project_compose(node, &bad_cmd, "x.test", false, 0, 0).is_err());
    }

    #[test]
    fn rejects_unsafe_db_values_and_newline_commands() {
        let php = find_preset("laravel").unwrap();
        let mut bad_db = config("laravel", Some(Database::Mariadb11), false);
        bad_db.db_password = Some("x\n      volumes: []".into());
        assert!(render_project_compose(php, &bad_db, "x.test", false, 0, 0).is_err());

        let node = find_preset("node-generic").unwrap();
        let mut nl = config("node-generic", None, false);
        nl.start_command = Some("npm run dev\nrm -rf /".into());
        assert!(render_project_compose(node, &nl, "x.test", false, 0, 0).is_err());

        // The default "app" credentials still render fine.
        let ok = config("laravel", Some(Database::Mariadb11), false);
        assert!(render_project_compose(php, &ok, "x.test", false, 0, 0).is_ok());
    }

    #[test]
    fn escapes_dollar_in_start_command() {
        let node = find_preset("node-generic").unwrap();
        let mut cfg = config("node-generic", Some(Database::Mysql84), false);
        cfg.start_command = Some("PORT=$PORT npm run dev".into());
        let out = render_project_compose(node, &cfg, "x.test", false, 0, 0).unwrap();
        // `$` is doubled so compose passes a literal `$` to the container
        // (db_* can no longer contain `$` — charset-validated above).
        assert!(out.contains("PORT=$$PORT npm run dev"));
        assert!(!out.replace("$$", "").contains('$'));
    }

    #[test]
    fn wordpress_ntfs_builds_for_extensions_with_root_workaround() {
        let preset = find_preset("wordpress").unwrap();
        let cfg = config("wordpress", Some(Database::Mariadb11), false);
        let out = render_project_compose(preset, &cfg, "aquashop.test", false, 0, 0).unwrap();
        // Extensions force a local build even on NTFS…
        assert!(out.contains("dockerfile: app.Dockerfile"));
        assert!(!out.contains("image: serversideup"));
        // …while the NTFS root workaround still applies.
        assert!(out.contains("user: root"));
        assert!(out.contains("php-fpm-root-run"));
    }

    #[test]
    fn php_dockerfile_renders_per_variant() {
        let wordpress = find_preset("wordpress").unwrap();
        let wsl = render_php_dockerfile(wordpress, "8.3", true, 1000, 1000);
        assert!(wsl.contains("FROM serversideup/php:8.3-fpm-nginx"));
        assert!(wsl.contains("RUN install-php-extensions mysqli"));
        assert!(wsl.contains("docker-php-serversideup-set-id www-data 1000:1000"));

        let ntfs = render_php_dockerfile(wordpress, "8.3", false, 0, 0);
        assert!(ntfs.contains("RUN install-php-extensions mysqli"));
        assert!(!ntfs.contains("set-id"));

        let laravel = find_preset("laravel").unwrap();
        let wsl_laravel = render_php_dockerfile(laravel, "8.4", true, 1000, 1000);
        assert!(!wsl_laravel.contains("install-php-extensions"));
        assert!(wsl_laravel.contains("set-id www-data 1000:1000"));
        assert!(!wsl_laravel.contains("{uid}"));
        assert!(php_needs_build(laravel, true));
        assert!(!php_needs_build(laravel, false));
        assert!(php_needs_build(wordpress, false));
    }
}
