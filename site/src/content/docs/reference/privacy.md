---
title: Privacy
description: Dockberth sends nothing — no telemetry, no crash reporting, no phoning home.
sidebar:
  order: 2
---

Dockberth sends **nothing**. There is no usage analytics, no crash
reporting, no tracking, no phoning home — the app has no telemetry code at
all.

## "Report a bug" stays fully in your hands

The **Report a bug** action sends nothing by itself: it collects versions
and counts (Dockberth, Tauri, Windows, Docker, WSL distros, project count
and preset ids — never names or paths), **shows you the exact block**, and
opens a prefilled GitHub issue that you review and submit yourself.

## Auto-updates

Checking for updates contacts GitHub Releases to download the signed
update manifest — a plain HTTPS request with no identifiers attached beyond
what any download implies.
