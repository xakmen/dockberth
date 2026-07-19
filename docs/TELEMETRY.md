# Telemetry & crash reporting

Dockberth's crash reporting is **strictly opt-in**. Nothing is ever sent
unless you explicitly enabled it — either in the one-time first-launch
dialog or later in **Settings** (sidebar footer → ⋯ → Settings). Builds
without a Sentry DSN baked in (all forks and local dev builds by default)
have the reporting code fully disabled regardless of the setting.

## What is sent (only when enabled, only on a crash)

- The crash itself: exception type, message, stack trace
- Dockberth version and environment (`dev` / `prod`)
- Basic runtime info the crash SDK attaches (OS family/version,
  architecture)

## What is scrubbed or never collected

- **User folders**: `C:\Users\<name>` and `/home/<name>` are replaced with
  placeholders before sending — your username never leaves the machine.
- **Project names and paths**: registered project identifiers are mapped
  to `project-1 … project-n`.
- **Breadcrumbs are disabled entirely** — they would embed shell commands
  that contain paths.
- **No IP address storage** (disable "store IP addresses" in the Sentry
  project settings server-side), no PII (`sendDefaultPii: false`), no
  machine hostname (`server_name` stripped).

## "Report a bug" is different

The **Report a bug** action works regardless of the telemetry setting and
sends nothing by itself: it collects versions and counts (Dockberth,
Tauri, Windows, Docker, WSL distros, project count and preset ids — never
names or paths), shows you the exact block, and opens a prefilled GitHub
issue that you submit yourself.

## Verifying (developers)

Debug builds expose a hidden `debug_panic` command
(`invoke("debug_panic")` from devtools) that crashes the Rust side with a
fake user path in the message — use it to confirm events arrive scrubbed
when opted in, and that nothing is emitted when opted out (watch the
network tab).
