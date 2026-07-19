//! Rust-side crash reporting (Sentry): panic hook only, strictly OPT-IN.
//!
//! - DSN comes from the build-time env SENTRY_DSN; an empty/absent DSN
//!   fully disables the SDK, so forks and dev builds send nothing.
//! - Sentry initializes ONLY when the user enabled telemetry in settings
//!   (checked before the Tauri builder starts; toggling therefore applies
//!   after an app restart on the Rust side).
//! - Scrubbing: user-profile paths are replaced with placeholders,
//!   breadcrumbs are disabled entirely (shell commands embed paths),
//!   no PII / IP / server name. See docs/TELEMETRY.md.

use std::borrow::Cow;

use sentry::protocol::Event;
use sentry::ClientInitGuard;

const DSN: Option<&str> = option_env!("SENTRY_DSN");

/// Replace `C:\Users\<name>` / `C:/Users/<name>` / `/home/<name>` segments
/// with placeholders. Pure — unit-tested.
pub fn scrub_string(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut rest = input;
    loop {
        let candidates = [
            ("C:\\Users\\", '\\'),
            ("C:/Users/", '/'),
            ("/home/", '/'),
        ];
        let hit = candidates
            .iter()
            .filter_map(|(prefix, sep)| rest.find(prefix).map(|i| (i, *prefix, *sep)))
            .min_by_key(|(i, ..)| *i);
        let Some((index, prefix, sep)) = hit else {
            out.push_str(rest);
            return out;
        };
        let after = index + prefix.len();
        out.push_str(&rest[..after]);
        out.push_str("<user>");
        let tail = &rest[after..];
        let name_end = tail
            .find(|c: char| c == sep || c == '/' || c == '\\' || c.is_whitespace())
            .unwrap_or(tail.len());
        rest = &tail[name_end..];
    }
}

fn scrub_event(mut event: Event<'static>) -> Event<'static> {
    if let Some(message) = event.message.take() {
        event.message = Some(scrub_string(&message));
    }
    if let Some(logentry) = event.logentry.as_mut() {
        logentry.message = scrub_string(&logentry.message);
    }
    for exception in event.exception.values.iter_mut() {
        if let Some(value) = exception.value.take() {
            exception.value = Some(scrub_string(&value));
        }
    }
    event.server_name = None;
    event
}

/// Initialize Sentry when the user opted in and a DSN was baked in.
/// The returned guard must stay alive for the app's lifetime.
pub fn init() -> Option<ClientInitGuard> {
    let dsn = DSN.unwrap_or("");
    if dsn.is_empty() || !crate::settings::load().telemetry_enabled {
        return None;
    }
    Some(sentry::init((
        dsn,
        sentry::ClientOptions {
            release: Some(Cow::Owned(format!("dockberth@{}", env!("CARGO_PKG_VERSION")))),
            environment: Some(if cfg!(debug_assertions) { "dev" } else { "prod" }.into()),
            send_default_pii: false,
            max_breadcrumbs: 0,
            server_name: None,
            before_send: Some(std::sync::Arc::new(|event| Some(scrub_event(event)))),
            ..Default::default()
        },
    )))
}

/// Debug-only crash trigger for verifying the Sentry pipeline end to end
/// (invoke("debug_panic") from devtools). No-op in release builds.
#[tauri::command]
pub fn debug_panic() -> Result<(), String> {
    if cfg!(debug_assertions) {
        panic!(
            "dockberth debug test panic from C:\\Users\\testuser\\sites\\secret (should be scrubbed)"
        );
    }
    Err("debug_panic is only available in debug builds".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scrubs_windows_and_wsl_home_paths() {
        assert_eq!(
            scrub_string(r"error at C:\Users\mika\sites\shop\web.php"),
            r"error at C:\Users\<user>\sites\shop\web.php"
        );
        assert_eq!(
            scrub_string("mount /home/mika/sites/shop failed"),
            "mount /home/<user>/sites/shop failed"
        );
        assert_eq!(
            scrub_string("C:/Users/mika and /home/dev and C:\\Users\\other"),
            "C:/Users/<user> and /home/<user> and C:\\Users\\<user>"
        );
    }

    #[test]
    fn leaves_other_paths_alone() {
        let input = r"D:\dockberth\src-tauri\src\lib.rs and /var/www/html";
        assert_eq!(scrub_string(input), input);
    }

    #[test]
    fn handles_path_at_end_of_string() {
        assert_eq!(scrub_string(r"C:\Users\mika"), r"C:\Users\<user>");
        assert_eq!(scrub_string("/home/mika"), "/home/<user>");
    }
}
