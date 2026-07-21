---
title: WSL2 and file paths
description: Why project location matters — WSL2 paths run Compose in-distro at native speed, NTFS paths run on Windows with a few caveats.
sidebar:
  order: 4
---

Where a project's files live changes how Dockberth runs it. The app detects
this automatically and shows each project's mode — this page explains what
the modes mean.

## Two modes

| Project location | How Compose runs | Filesystem speed |
| ---------------- | ---------------- | ---------------- |
| Inside a WSL2 distro (`\\wsl$\Ubuntu\home\you\myapp`) | Inside the distro (`wsl.exe -d <distro>`) | Native — fast |
| NTFS drive (`C:\projects\myapp`) | Directly on Windows | Crosses the Windows↔Linux boundary — slower |

Docker Desktop's WSL2 backend runs containers in a Linux VM. When project
files are already inside WSL2, bind mounts are native Linux filesystem
operations — `npm install`, WordPress admin, and anything file-heavy runs at
full speed. When files are on NTFS, every file access crosses a boundary,
which is noticeably slower for large codebases (still perfectly usable for
smaller ones).

**Recommendation:** keep active projects inside your WSL2 distro if you
can. NTFS is fine for lighter projects or when WSL2 isn't an option.

## What Dockberth handles for you

You don't configure any of this — it follows from the project's path:

- **File ownership (WSL2):** containers are remapped to your distro user's
  UID/GID, so files created inside containers belong to you, not root, and
  the app's workers can write where they need to.
- **Permissions (NTFS):** Windows bind mounts appear root-owned inside
  Linux containers and can't be chown-ed, so on NTFS the app container runs
  as root. This is a local-dev-only concession, generated per project.
- **`node_modules` (Node projects on NTFS):** the generated compose overlays
  an anonymous volume on `/app/node_modules` — a bind-mounted `node_modules`
  on a Windows drive is unusably slow, and native modules built on Windows
  don't run in Linux containers. Consequence: run installs *inside* the
  container (open a shell from the UI, then `npm install`). WSL2 projects
  don't have this asymmetry — install from either side.
