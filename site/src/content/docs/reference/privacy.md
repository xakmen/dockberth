---
title: Privacy & telemetry
description: No telemetry by default. Crash reporting is strictly opt-in and heavily scrubbed — here is exactly what is sent.
sidebar:
  order: 2
---

Dockberth sends **nothing** by default. There is no usage analytics, no
tracking, no phoning home.

## Crash reporting is strictly opt-in

Crash reporting is disabled unless you explicitly enable it — either in the
one-time first-launch dialog or later in **Settings**. Builds without a
crash-reporting DSN baked in (all forks and local dev builds) have the
reporting code fully disabled regardless of the setting.

### What is sent (only when enabled, only on a crash)

- The crash itself: exception type, message, stack trace
- Dockberth version and environment (`dev` / `prod`)
- Basic runtime info the crash SDK attaches (OS family/version,
  architecture)

### What is scrubbed or never collected

- **User folders** — `C:\Users\<name>` and `/home/<name>` are replaced with
  placeholders before sending; your username never leaves the machine.
- **Project names and paths** — registered project identifiers are mapped
  to `project-1 … project-n`.
- **Breadcrumbs are disabled entirely** — they would embed shell commands
  that contain paths.
- **No IP address storage, no PII, no machine hostname.**

## "Report a bug" is different

The **Report a bug** action works regardless of the telemetry setting and
sends nothing by itself: it collects versions and counts (Dockberth, Tauri,
Windows, Docker, WSL distros, project count and preset ids — never names or
paths), **shows you the exact block**, and opens a prefilled GitHub issue
that you review and submit yourself.

## Source of truth

This page summarizes
[docs/TELEMETRY.md](https://github.com/xakmen/dockberth/blob/main/docs/TELEMETRY.md)
in the repository — the implementation and that document are kept in sync,
and the scrubbing logic is covered by unit tests.
