//! Windows hosts-file management for `<project>.test` domains.
//!
//! Current milestone: a pragmatic single-shot approach — if the entry is
//! missing, an elevated PowerShell one-liner (one UAC prompt) appends it.
//! The public surface (`hosts_ensure`) is intentionally tiny so the planned
//! dedicated elevated helper binary (writing a `# dockberth:begin/end`
//! marker block) can be a drop-in replacement. Per-platform: on macOS/Linux
//! this module will be reimplemented behind the same interface (sudo/polkit).

use crate::template::is_valid_project_name;

const HOSTS_PATH: &str = r"C:\Windows\System32\drivers\etc\hosts";

fn is_valid_domain(domain: &str) -> bool {
    domain
        .strip_suffix(".test")
        .is_some_and(is_valid_project_name)
}

/// True when the hosts file already maps `domain` to 127.0.0.1.
pub fn domain_present(domain: &str) -> Result<bool, String> {
    let contents =
        std::fs::read_to_string(HOSTS_PATH).map_err(|e| format!("cannot read hosts file: {e}"))?;
    Ok(contents.lines().any(|line| {
        let line = line.split('#').next().unwrap_or("");
        let mut tokens = line.split_whitespace();
        matches!(tokens.next(), Some("127.0.0.1")) && tokens.any(|host| host == domain)
    }))
}

/// Run an elevated PowerShell one-liner (single UAC prompt). The command is
/// passed as -EncodedCommand (base64 of UTF-16LE): Start-Process
/// -ArgumentList mangles nested quotes, and base64 needs no quoting.
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

/// Remove the `127.0.0.1 <domain>` line (elevated). Returns whether the
/// entry is absent afterwards (false = the user declined elevation).
pub async fn hosts_remove(domain: String) -> Result<bool, String> {
    if !is_valid_domain(&domain) {
        return Err(format!("invalid domain '{domain}'"));
    }
    if !domain_present(&domain)? {
        return Ok(true);
    }
    // The domain is validated ([a-z0-9-] + ".test"); escape regex dots.
    let pattern = format!("^\\s*127\\.0\\.0\\.1\\s+{}\\s*$", domain.replace('.', "\\."));
    let inner = format!(
        "Set-Content -Path {HOSTS_PATH} -Value (Get-Content {HOSTS_PATH} | \
         Where-Object {{ $_ -notmatch '{pattern}' }})"
    );
    run_elevated(inner).await?;
    Ok(!domain_present(&domain)?)
}

/// Ensure `127.0.0.1 <domain>` exists in the hosts file, elevating via a
/// single UAC prompt when an append is needed. Returns whether the entry is
/// present afterwards (false = the user declined elevation or it failed).
#[tauri::command]
pub async fn hosts_ensure(domain: String) -> Result<bool, String> {
    if !is_valid_domain(&domain) {
        return Err(format!("invalid domain '{domain}'"));
    }
    if domain_present(&domain)? {
        return Ok(true);
    }

    let inner = format!("Add-Content -Path {HOSTS_PATH} -Value \"`n127.0.0.1 {domain}\"");
    run_elevated(inner).await?;
    domain_present(&domain)
}
