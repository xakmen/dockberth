//! Windows hosts-file management for `<project>.test` domains.
//!
//! All Dockberth entries live inside one managed block:
//!
//! ```text
//! # BEGIN DOCKBERTH MANAGED BLOCK — do not edit between these markers
//! 127.0.0.1 harbor-test.test
//! # END DOCKBERTH MANAGED BLOCK
//! ```
//!
//! Everything outside the block is user territory and is preserved
//! byte-for-byte (line endings and BOM included). There is exactly ONE
//! write path (`sync_to`): the full new file content is computed and
//! sanity-checked in Rust, and the elevated PowerShell script is dumb —
//! backup, write tmp, move. It never filters or edits content: the
//! previous implementation filtered inside PowerShell, and any empty read
//! (file locked by a concurrent elevated write during batch deletes)
//! collapsed to `Set-Content -Value @()` — wiping the whole file.
//!
//! Per-platform: on macOS/Linux this module is reimplemented behind the
//! same interface (sudo/polkit instead of UAC).

use tauri::AppHandle;

use crate::registry;
use crate::template::is_valid_project_name;

const HOSTS_PATH: &str = r"C:\Windows\System32\drivers\etc\hosts";
const BACKUP_PATH: &str = r"C:\Windows\System32\drivers\etc\hosts.dockberth.bak";
const TMP_PATH: &str = r"C:\Windows\System32\drivers\etc\hosts.dockberth.tmp";

const BEGIN_MARKER: &str =
    "# BEGIN DOCKBERTH MANAGED BLOCK — do not edit between these markers";
const END_MARKER: &str = "# END DOCKBERTH MANAGED BLOCK";

fn is_valid_domain(domain: &str) -> bool {
    domain
        .strip_suffix(".test")
        .is_some_and(is_valid_project_name)
}

fn line_maps_domain(line: &str, domain: &str) -> bool {
    let line = line.split('#').next().unwrap_or("");
    let mut tokens = line.split_whitespace();
    matches!(tokens.next(), Some("127.0.0.1")) && tokens.any(|host| host == domain)
}

fn content_has_domain(content: &str, domain: &str) -> bool {
    content.lines().any(|line| line_maps_domain(line, domain))
}

/// True when the hosts file already maps `domain` to 127.0.0.1.
pub fn domain_present(domain: &str) -> Result<bool, String> {
    let contents = read_hosts()?;
    Ok(content_has_domain(&contents, domain))
}

fn read_hosts() -> Result<String, String> {
    match std::fs::read_to_string(HOSTS_PATH) {
        Ok(raw) => Ok(raw),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(format!("cannot read hosts file: {e}")),
    }
}

/// Split into (content, eol) pairs, preserving the exact line endings so
/// untouched regions can be reassembled byte-for-byte.
fn split_keep_eol(raw: &str) -> Vec<(String, String)> {
    let mut out: Vec<(String, String)> = Vec::new();
    let mut current = String::new();
    let mut chars = raw.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\n' {
            out.push((std::mem::take(&mut current), "\n".to_string()));
        } else if c == '\r' && chars.peek() == Some(&'\n') {
            chars.next();
            out.push((std::mem::take(&mut current), "\r\n".to_string()));
        } else {
            current.push(c);
        }
    }
    if !current.is_empty() {
        out.push((current, String::new()));
    }
    out
}

/// A stray Dockberth line outside the block (written by the pre-block
/// implementation): exactly `127.0.0.1 <name>.test` for a REGISTERED
/// project. Foreign .test lines (unknown names, extra hosts, comments)
/// are not ours and stay untouched.
fn is_stray_entry(content: &str, registered_names: &[String]) -> bool {
    let mut tokens = content.split_whitespace();
    if tokens.next() != Some("127.0.0.1") {
        return false;
    }
    let Some(host) = tokens.next() else {
        return false;
    };
    if tokens.next().is_some() {
        return false; // extra tokens/comment — not a line we wrote
    }
    host.strip_suffix(".test")
        .is_some_and(|name| registered_names.iter().any(|n| n == name))
}

pub struct HostsRender {
    pub content: String,
    pub changed: bool,
}

/// Compute the new hosts content: managed block reflecting `desired`
/// (sorted, deduped), stray registered entries migrated into the block,
/// everything else preserved byte-for-byte. Pure — unit-tested without
/// elevation.
pub fn render_hosts(
    raw: &str,
    desired: &[String],
    registered_names: &[String],
) -> Result<HostsRender, String> {
    let bom = raw.starts_with('\u{feff}');
    let body = raw.strip_prefix('\u{feff}').unwrap_or(raw);
    let lines = split_keep_eol(body);

    // Safety rail: the parser must prove it is lossless on THIS input
    // before we dare rewrite the file.
    let rejoined: String = lines
        .iter()
        .map(|(c, e)| format!("{c}{e}"))
        .collect();
    if rejoined != body {
        return Err("hosts parser failed the lossless roundtrip — aborting".into());
    }

    let eol = if body.contains("\r\n") || !body.contains('\n') {
        "\r\n"
    } else {
        "\n"
    };

    enum Phase {
        Before,
        InBlock,
        After,
        InDropBlock,
    }
    let mut phase = Phase::Before;
    let mut before: Vec<(String, String)> = Vec::new();
    let mut after: Vec<(String, String)> = Vec::new();
    let mut had_block = false;
    let mut end_eol: Option<String> = None;
    for (content, e) in lines {
        let t = content.trim();
        match phase {
            Phase::Before => {
                if t == BEGIN_MARKER {
                    had_block = true;
                    phase = Phase::InBlock;
                } else {
                    before.push((content, e));
                }
            }
            Phase::InBlock => {
                if t == END_MARKER {
                    end_eol = Some(e);
                    phase = Phase::After;
                }
                // old block entries are recomputed, not carried over
            }
            Phase::After => {
                if t == BEGIN_MARKER {
                    // duplicated block — keep the first, drop the rest
                    phase = Phase::InDropBlock;
                } else {
                    after.push((content, e));
                }
            }
            Phase::InDropBlock => {
                if t == END_MARKER {
                    phase = Phase::After;
                }
            }
        }
    }
    if matches!(phase, Phase::InBlock | Phase::InDropBlock) {
        return Err(
            "hosts managed block has a BEGIN marker without an END marker — aborting".into(),
        );
    }

    // Migrate strays: drop them from user territory (the block, computed
    // from the registry-derived desired set, is their new home).
    let keep = |(content, _): &(String, String)| !is_stray_entry(content, registered_names);
    before.retain(keep);
    after.retain(keep);

    let mut entries: Vec<String> = desired.to_vec();
    entries.sort();
    entries.dedup();

    // No block on disk and nothing to write → leave the file alone.
    if !had_block && entries.is_empty() {
        let content: String = if bom {
            format!("\u{feff}{}", rejoin(&before, &after, None, eol, false, &entries))
        } else {
            rejoin(&before, &after, None, eol, false, &entries)
        };
        let changed = content != raw;
        return Ok(HostsRender { content, changed });
    }

    let content_body = rejoin(&before, &after, end_eol.as_deref(), eol, true, &entries);
    let content = if bom {
        format!("\u{feff}{content_body}")
    } else {
        content_body
    };
    let changed = content != raw;
    Ok(HostsRender { content, changed })
}

fn rejoin(
    before: &[(String, String)],
    after: &[(String, String)],
    end_eol: Option<&str>,
    eol: &str,
    with_block: bool,
    entries: &[String],
) -> String {
    let mut out = String::new();
    for (c, e) in before {
        out.push_str(c);
        out.push_str(e);
    }
    if with_block {
        // If the preceding content does not end with a newline, add one so
        // the BEGIN marker starts on its own line (original bytes intact).
        if !out.is_empty() && !out.ends_with('\n') {
            out.push_str(eol);
        }
        out.push_str(BEGIN_MARKER);
        out.push_str(eol);
        for domain in entries {
            out.push_str("127.0.0.1 ");
            out.push_str(domain);
            out.push_str(eol);
        }
        out.push_str(END_MARKER);
        // Keep the END line's original ending when replacing in place;
        // a freshly appended block ends with a newline.
        out.push_str(end_eol.unwrap_or(eol));
    }
    for (c, e) in after {
        out.push_str(c);
        out.push_str(e);
    }
    out
}

/// Run an elevated PowerShell script (single UAC prompt), passed as
/// -EncodedCommand (base64 of UTF-16LE) so no quoting can mangle it.
async fn run_elevated(inner: String) -> Result<(), String> {
    let utf16: Vec<u8> = inner.encode_utf16().flat_map(u16::to_le_bytes).collect();
    let encoded = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, utf16);
    let script = format!(
        "Start-Process -Verb RunAs -Wait -WindowStyle Hidden powershell -ArgumentList \
         '-NoProfile','-EncodedCommand','{encoded}'"
    );
    let result = tauri::async_runtime::spawn_blocking(move || {
        std::process::Command::new("powershell")
            .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &script])
            .status()
    })
    .await
    .map_err(|e| format!("elevation task failed: {e}"))?;
    // A declined UAC prompt surfaces as a non-zero exit; callers re-check
    // the hosts file as the source of truth.
    let _ = result.map_err(|e| format!("cannot launch elevated PowerShell: {e}"))?;
    Ok(())
}

fn registered_names(app: &AppHandle) -> Result<Vec<String>, String> {
    Ok(registry::load_entries(app)?
        .into_iter()
        .map(|e| e.name)
        .collect())
}

fn registered_domains(app: &AppHandle) -> Result<Vec<String>, String> {
    Ok(registered_names(app)?
        .into_iter()
        .map(|n| format!("{n}.test"))
        .collect())
}

/// THE single write path. Renders the new content in Rust, then has the
/// dumb elevated script back up the current file, write a tmp file and
/// move it over hosts. No content logic ever runs elevated.
async fn sync_to(app: &AppHandle, desired: Vec<String>) -> Result<String, String> {
    for domain in &desired {
        if !is_valid_domain(domain) {
            return Err(format!("invalid domain '{domain}'"));
        }
    }
    let names = registered_names(app)?;
    let raw = read_hosts()?;
    let render = render_hosts(&raw, &desired, &names)?;
    if !render.changed {
        return Ok(render.content); // identical — no write, no UAC
    }

    let content_b64 =
        base64::Engine::encode(&base64::engine::general_purpose::STANDARD, render.content.as_bytes());
    let script = format!(
        "$b=[Convert]::FromBase64String('{content_b64}')\n\
         Copy-Item -Path '{HOSTS_PATH}' -Destination '{BACKUP_PATH}' -Force -ErrorAction SilentlyContinue\n\
         [System.IO.File]::WriteAllBytes('{TMP_PATH}',$b)\n\
         Move-Item -Path '{TMP_PATH}' -Destination '{HOSTS_PATH}' -Force"
    );
    run_elevated(script).await?;
    read_hosts()
}

/// Ensure `127.0.0.1 <domain>` exists (managed block). Returns whether the
/// entry is present afterwards (false = the user declined elevation).
#[tauri::command]
pub async fn hosts_ensure(app: AppHandle, domain: String) -> Result<bool, String> {
    if !is_valid_domain(&domain) {
        return Err(format!("invalid domain '{domain}'"));
    }
    let mut desired = registered_domains(&app)?;
    if !desired.contains(&domain) {
        desired.push(domain.clone());
    }
    let content = sync_to(&app, desired).await?;
    Ok(content_has_domain(&content, &domain))
}

/// Remove `domain` from the managed block. Returns whether the entry is
/// absent afterwards (false = the user declined elevation).
pub async fn hosts_remove(app: &AppHandle, domain: String) -> Result<bool, String> {
    if !is_valid_domain(&domain) {
        return Err(format!("invalid domain '{domain}'"));
    }
    let desired: Vec<String> = registered_domains(app)?
        .into_iter()
        .filter(|d| d != &domain)
        .collect();
    let content = sync_to(app, desired).await?;
    Ok(!content_has_domain(&content, &domain))
}

/// Recreate the managed block for every registered project (one UAC) —
/// the recovery path after hosts-file damage. Returns whether all
/// registered domains resolve afterwards.
#[tauri::command]
pub async fn hosts_repair(app: AppHandle) -> Result<bool, String> {
    let desired = registered_domains(&app)?;
    let content = sync_to(&app, desired.clone()).await?;
    Ok(desired.iter().all(|d| content_has_domain(&content, d)))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn names(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    const USER_FILE: &str = "# Copyright Microsoft\r\n127.0.0.1 localhost\r\n192.168.1.5 nas.local\r\n";

    #[test]
    fn appends_block_preserving_user_lines_crlf() {
        let out = render_hosts(USER_FILE, &names(&["app.test"]), &names(&["app"])).unwrap();
        assert!(out.changed);
        assert!(out.content.starts_with(USER_FILE));
        assert!(out.content.contains(&format!("{BEGIN_MARKER}\r\n127.0.0.1 app.test\r\n{END_MARKER}\r\n")));
    }

    #[test]
    fn replaces_existing_block_in_place() {
        let raw = format!(
            "top\r\n{BEGIN_MARKER}\r\n127.0.0.1 old.test\r\n{END_MARKER}\r\nbottom\r\n"
        );
        let out = render_hosts(&raw, &names(&["b.test", "a.test", "a.test"]), &[]).unwrap();
        assert_eq!(
            out.content,
            format!("top\r\n{BEGIN_MARKER}\r\n127.0.0.1 a.test\r\n127.0.0.1 b.test\r\n{END_MARKER}\r\nbottom\r\n")
        );
    }

    #[test]
    fn duplicated_blocks_keep_first_drop_rest() {
        let raw = format!(
            "u1\r\n{BEGIN_MARKER}\r\n127.0.0.1 x.test\r\n{END_MARKER}\r\nu2\r\n{BEGIN_MARKER}\r\n127.0.0.1 y.test\r\n{END_MARKER}\r\nu3\r\n"
        );
        let out = render_hosts(&raw, &names(&["z.test"]), &[]).unwrap();
        assert_eq!(
            out.content,
            format!("u1\r\n{BEGIN_MARKER}\r\n127.0.0.1 z.test\r\n{END_MARKER}\r\nu2\r\nu3\r\n")
        );
    }

    #[test]
    fn migrates_stray_registered_entry_and_keeps_foreign_test_lines() {
        let raw = "127.0.0.1 stray.test\r\n127.0.0.1 foreign.test\r\n10.0.0.1 other.test extra\r\n";
        let out = render_hosts(raw, &names(&["stray.test"]), &names(&["stray"])).unwrap();
        // stray migrated into the block; foreign lines untouched
        assert!(!out.content.starts_with("127.0.0.1 stray.test"));
        assert!(out.content.contains("127.0.0.1 foreign.test\r\n"));
        assert!(out.content.contains("10.0.0.1 other.test extra\r\n"));
        assert!(out.content.contains(&format!("{BEGIN_MARKER}\r\n127.0.0.1 stray.test\r\n{END_MARKER}")));
    }

    #[test]
    fn preserves_lf_only_files() {
        let raw = "user\n127.0.0.1 localhost\n";
        let out = render_hosts(raw, &names(&["app.test"]), &[]).unwrap();
        assert!(out.content.starts_with("user\n127.0.0.1 localhost\n"));
        assert!(out.content.contains(&format!("{BEGIN_MARKER}\n127.0.0.1 app.test\n{END_MARKER}\n")));
        assert!(!out.content.contains('\r'));
    }

    #[test]
    fn preserves_bom_and_absence_of_bom() {
        let with_bom = format!("\u{feff}line\r\n");
        let out = render_hosts(&with_bom, &names(&["a.test"]), &[]).unwrap();
        assert!(out.content.starts_with('\u{feff}'));

        let out2 = render_hosts("line\r\n", &names(&["a.test"]), &[]).unwrap();
        assert!(!out2.content.starts_with('\u{feff}'));
    }

    #[test]
    fn empty_file_and_no_desired_stays_empty_without_write() {
        let out = render_hosts("", &[], &[]).unwrap();
        assert!(!out.changed);
        assert_eq!(out.content, "");
    }

    #[test]
    fn empty_file_gets_block_with_crlf_default() {
        let out = render_hosts("", &names(&["a.test"]), &[]).unwrap();
        assert_eq!(
            out.content,
            format!("{BEGIN_MARKER}\r\n127.0.0.1 a.test\r\n{END_MARKER}\r\n")
        );
    }

    #[test]
    fn file_without_trailing_newline_is_preserved() {
        let raw = "user-line-no-eol";
        let out = render_hosts(raw, &names(&["a.test"]), &[]).unwrap();
        assert!(out.content.starts_with("user-line-no-eol\r\n"));
        assert!(out.content.contains(BEGIN_MARKER));
    }

    #[test]
    fn identical_content_reports_unchanged() {
        let raw = format!(
            "top\r\n{BEGIN_MARKER}\r\n127.0.0.1 a.test\r\n{END_MARKER}\r\n"
        );
        let out = render_hosts(&raw, &names(&["a.test"]), &[]).unwrap();
        assert!(!out.changed);
        assert_eq!(out.content, raw);
    }

    #[test]
    fn unterminated_block_aborts() {
        let raw = format!("{BEGIN_MARKER}\r\n127.0.0.1 a.test\r\n");
        assert!(render_hosts(&raw, &[], &[]).is_err());
    }

    #[test]
    fn emptied_desired_clears_block_but_keeps_user_lines() {
        let raw = format!(
            "keep-me\r\n{BEGIN_MARKER}\r\n127.0.0.1 gone.test\r\n{END_MARKER}\r\nalso-keep\r\n"
        );
        let out = render_hosts(&raw, &[], &[]).unwrap();
        assert_eq!(
            out.content,
            format!("keep-me\r\n{BEGIN_MARKER}\r\n{END_MARKER}\r\nalso-keep\r\n")
        );
    }
}
