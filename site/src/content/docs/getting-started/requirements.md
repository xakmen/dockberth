---
title: Requirements
description: What you need before installing Dockberth — Windows 10/11 and Docker Desktop, ideally with the WSL2 backend.
sidebar:
  order: 2
---

Dockberth needs two things:

- **Windows 10 or 11**
- **[Docker Desktop](https://www.docker.com/products/docker-desktop/)** —
  the WSL2 backend is recommended

That's it. No local PHP, Node, database or WP-CLI installs are required —
everything your projects need runs in containers.

## Why WSL2 is recommended

Docker Desktop on Windows can run with either the WSL2 backend or Hyper-V.
Dockberth works with both, but WSL2 unlocks an extra speed tier: projects
whose files live *inside* a WSL2 distro (e.g. `\\wsl$\Ubuntu\home\you\myapp`)
run Compose in-distro with native filesystem performance. Projects on
regular NTFS drives (`C:\`, `D:\`) work too — Dockberth handles both and
shows you which mode each project uses.

See [WSL2 and file paths](/guides/wsl2-and-file-paths/) for the details and
trade-offs.

## Ports

Dockberth runs a shared reverse proxy (Traefik) that listens on ports
**80** and **443**. If another local server (IIS, XAMPP, Laragon, Skype…)
already occupies them, project domains won't resolve — see
[Troubleshooting](/reference/troubleshooting/) for how to find and free the
ports.

## Docker doesn't need to be running first

If Docker Desktop is installed but not running, Dockberth shows its status
and can start it for you — no need to launch it manually before opening the
app.
