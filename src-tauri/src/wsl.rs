//! WSL2 integration: distro discovery, UNC path handling and command
//! execution inside a distro.
//!
//! Settled decision: projects on WSL2 paths run `docker compose` *inside*
//! the distro via `wsl.exe -d <distro> --cd <linux-path>` so bind mounts use
//! fast native Linux paths and containers stay unprivileged. Per-platform
//! module: on macOS/Linux this becomes a no-op behind the same interface.
//!
//! CRITICAL parsing note: `wsl.exe` writes its *own* output (e.g. `-l -v`)
//! as UTF-16LE (UTF-8 if the user sets WSL_UTF8=1). Commands *run inside*
//! a distro pass the child's UTF-8 output through unchanged. On top of
//! that, the shell plugin's `Command::output()` reads pipes in "line" mode:
//! it splits on the *bytes* 0x0A/0x0D and re-joins with '\n', which shifts
//! the 2-byte alignment of a UTF-16LE stream and turns every line after
//! the first into garbage. All wsl.exe invocations here therefore go
//! through `run_wsl_raw`, which collects the byte stream verbatim.

use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

/// Internal Docker Desktop distros that must never show up in the UI.
const HIDDEN_DISTROS: [&str; 2] = ["docker-desktop", "docker-desktop-data"];

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WslDistro {
    pub name: String,
    pub is_default: bool,
    /// WSL version (1 or 2). Dockberth requires 2.
    pub version: u32,
}

/// Output of a `wsl.exe` invocation, collected byte-for-byte.
pub struct WslOutput {
    pub code: Option<i32>,
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
}

impl WslOutput {
    pub fn success(&self) -> bool {
        self.code == Some(0)
    }
}

/// Run `wsl.exe <args>` collecting stdout/stderr verbatim (raw events,
/// not the plugin's line-splitting `output()` — see module docs).
async fn run_wsl_raw(app: &AppHandle, args: &[&str]) -> Result<WslOutput, String> {
    let (mut rx, _child) = app
        .shell()
        .command("wsl.exe")
        .args(args)
        .set_raw_out(true)
        .spawn()
        .map_err(|e| format!("cannot run wsl.exe: {e}"))?;
    let mut out = WslOutput {
        code: None,
        stdout: Vec::new(),
        stderr: Vec::new(),
    };
    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(bytes) => out.stdout.extend(bytes),
            CommandEvent::Stderr(bytes) => out.stderr.extend(bytes),
            CommandEvent::Terminated(payload) => out.code = payload.code,
            CommandEvent::Error(_) => {}
            _ => {}
        }
    }
    Ok(out)
}

/// Decode wsl.exe output: UTF-16LE by default (sniffed via NUL bytes,
/// which valid UTF-8 text never contains), UTF-8 when WSL_UTF8=1 is set
/// in the user's environment or the bytes come from a child process.
pub(crate) fn decode_wsl_text(bytes: &[u8]) -> String {
    if !bytes.contains(&0) {
        return String::from_utf8_lossy(bytes).into_owned();
    }
    let units: Vec<u16> = bytes
        .chunks_exact(2)
        .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
        .collect();
    String::from_utf16_lossy(&units)
        .trim_start_matches('\u{feff}')
        .to_string()
}

/// Parse `wsl.exe -l -v` output. Format (after UTF-16 decode):
/// ```text
///   NAME            STATE           VERSION
/// * Ubuntu-24.04    Running         2
/// ```
fn parse_distro_list(text: &str) -> Vec<WslDistro> {
    let mut distros = Vec::new();
    for line in text.lines().skip(1) {
        let line = line.trim_end();
        if line.trim().is_empty() {
            continue;
        }
        let is_default = line.trim_start().starts_with('*');
        let line = line.trim_start().trim_start_matches('*').trim_start();
        // Columns are whitespace-separated: <name> <state> <version>.
        // Popping state/version off the end tolerates names with spaces.
        let mut tokens = line.split_whitespace().collect::<Vec<_>>();
        if tokens.len() < 3 {
            continue;
        }
        let version: u32 = match tokens.pop().unwrap_or_default().parse() {
            Ok(v) => v,
            Err(_) => continue, // header or malformed line
        };
        let _state = tokens.pop();
        let name = tokens.join(" ");
        if name.is_empty() || HIDDEN_DISTROS.contains(&name.as_str()) {
            continue;
        }
        distros.push(WslDistro {
            name,
            is_default,
            version,
        });
    }
    distros
}

/// Parse a WSL UNC path (`\\wsl.localhost\<distro>\<path>` or legacy
/// `\\wsl$\<distro>\<path>`) into `(distro, linux_path)`.
/// Pure string transformation — no shelling out to wslpath.
pub fn parse_unc(path: &str) -> Option<(String, String)> {
    let normalized = path.replace('/', "\\");
    let rest = ["\\\\wsl.localhost\\", "\\\\wsl$\\"]
        .iter()
        .find_map(|prefix| normalized.strip_prefix(prefix))?;
    let mut segments = rest.split('\\').filter(|s| !s.is_empty());
    let distro = segments.next()?.to_string();
    let linux_path = {
        let joined = segments.collect::<Vec<_>>().join("/");
        format!("/{joined}")
    };
    Some((distro, linux_path))
}

/// List installed distros (Docker Desktop internals filtered out).
#[tauri::command]
pub async fn wsl_list_distros(app: AppHandle) -> Result<Vec<WslDistro>, String> {
    let output = run_wsl_raw(&app, &["-l", "-v"]).await?;
    if !output.success() {
        return Err(format!(
            "wsl.exe -l -v failed: {}",
            decode_wsl_text(&output.stderr).trim()
        ));
    }
    Ok(parse_distro_list(&decode_wsl_text(&output.stdout)))
}

/// Run a command inside a distro: `wsl.exe -d <distro> [--cd <dir>] -- <args>`.
/// The child's output is passed through as-is (UTF-8 for docker).
pub async fn run_in_distro(
    app: &AppHandle,
    distro: &str,
    cd: Option<&str>,
    args: &[&str],
) -> Result<WslOutput, String> {
    let mut full: Vec<&str> = vec!["-d", distro];
    if let Some(dir) = cd {
        full.extend_from_slice(&["--cd", dir]);
    }
    full.push("--");
    full.extend_from_slice(args);
    run_wsl_raw(app, &full).await
}

/// UID and GID of the distro's default user (used to remap www-data in the
/// generated app image so bind-mounted files stay writable, unprivileged).
pub async fn default_uid_gid(app: &AppHandle, distro: &str) -> Result<(u32, u32), String> {
    let output = run_in_distro(app, distro, None, &["id", "-u"]).await?;
    let uid: u32 = String::from_utf8_lossy(&output.stdout)
        .trim()
        .parse()
        .map_err(|_| format!("cannot determine UID of the default user in '{distro}'"))?;
    let output = run_in_distro(app, distro, None, &["id", "-g"]).await?;
    let gid: u32 = String::from_utf8_lossy(&output.stdout)
        .trim()
        .parse()
        .map_err(|_| format!("cannot determine GID of the default user in '{distro}'"))?;
    Ok((uid, gid))
}

/// Check that Docker Desktop's WSL integration is enabled for a distro.
#[tauri::command]
pub async fn wsl_check_docker(app: AppHandle, distro: String) -> Result<(), String> {
    let output = run_in_distro(
        &app,
        &distro,
        None,
        &["docker", "version", "--format", "{{.Server.Version}}"],
    )
    .await?;
    if output.success() && !output.stdout.is_empty() {
        return Ok(());
    }
    Err(format!(
        "Docker is not available inside '{distro}'. Enable integration for \
         {distro} in Docker Desktop → Settings → Resources → WSL integration."
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_wsl_localhost_unc() {
        let (distro, path) =
            parse_unc(r"\\wsl.localhost\Ubuntu-24.04\home\dev\sites\aquashop").unwrap();
        assert_eq!(distro, "Ubuntu-24.04");
        assert_eq!(path, "/home/dev/sites/aquashop");
    }

    #[test]
    fn parses_legacy_wsl_dollar_unc() {
        let (distro, path) = parse_unc(r"\\wsl$\Ubuntu-22.04\srv\www").unwrap();
        assert_eq!(distro, "Ubuntu-22.04");
        assert_eq!(path, "/srv/www");
    }

    #[test]
    fn parses_distro_name_with_spaces_and_deep_paths() {
        let (distro, path) = parse_unc(
            r"\\wsl.localhost\My Custom Distro\home\dev\very\deep\nested\project\dir",
        )
        .unwrap();
        assert_eq!(distro, "My Custom Distro");
        assert_eq!(path, "/home/dev/very/deep/nested/project/dir");
    }

    #[test]
    fn parses_forward_slashes_and_trailing_slash() {
        let (distro, path) = parse_unc("//wsl.localhost/Ubuntu-24.04/home/dev/app/").unwrap();
        assert_eq!(distro, "Ubuntu-24.04");
        assert_eq!(path, "/home/dev/app");
    }

    #[test]
    fn distro_root_maps_to_slash() {
        let (distro, path) = parse_unc(r"\\wsl$\Ubuntu-24.04").unwrap();
        assert_eq!(distro, "Ubuntu-24.04");
        assert_eq!(path, "/");
    }

    #[test]
    fn rejects_non_wsl_paths() {
        assert!(parse_unc(r"C:\Users\dev\sites\app").is_none());
        assert!(parse_unc(r"\\server\share\folder").is_none());
        assert!(parse_unc("/home/dev/app").is_none());
    }

    #[test]
    fn decodes_utf16le_with_bom() {
        let text = "  NAME\r\n* Ubuntu-24.04    Running         2\r\n";
        let mut bytes = vec![0xFF, 0xFE]; // BOM
        bytes.extend(text.encode_utf16().flat_map(u16::to_le_bytes));
        assert_eq!(decode_wsl_text(&bytes), text);
    }

    #[test]
    fn decodes_utf8_when_wsl_utf8_is_set() {
        let text = "  NAME\r\n* Ubuntu-24.04    Running         2\r\n";
        assert_eq!(decode_wsl_text(text.as_bytes()), text);
    }

    #[test]
    fn parses_distro_list_output() {
        let text = "  NAME            STATE           VERSION\r\n\
                    * Ubuntu-24.04    Running         2\r\n\
                    \r\n\
                      docker-desktop  Running         2\r\n\
                      Debian          Stopped         1\r\n";
        let distros = parse_distro_list(text);
        assert_eq!(distros.len(), 2);
        assert_eq!(distros[0].name, "Ubuntu-24.04");
        assert!(distros[0].is_default);
        assert_eq!(distros[0].version, 2);
        assert_eq!(distros[1].name, "Debian");
        assert!(!distros[1].is_default);
        assert_eq!(distros[1].version, 1);
    }
}
