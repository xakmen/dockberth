# Dockberth Architecture

> Stub — this document grows as the implementation lands. The settled
> decisions below are binding; details and diagrams follow.

## Overview

Dockberth is a Tauri 2 desktop app for Windows. The React/TypeScript frontend
owns all business logic: project registry, template rendering, orchestration
flow, state. The Rust side is deliberately thin — command wrappers that shell
out to external CLIs (`docker`, `wsl.exe`) and return raw results.

```
┌─────────────────────────────────────────────┐
│ React UI (src/)                             │
│ pages · components · hooks · lib            │
└──────────────────┬──────────────────────────┘
                   │ Tauri IPC (invoke)
┌──────────────────┴──────────────────────────┐
│ Rust commands (src-tauri/src/)              │
│ docker.rs · wsl.rs · hosts.rs               │
└───────┬───────────────┬─────────────────────┘
        │               │
   docker CLI       wsl.exe          elevated hosts helper
```

## Settled decisions

- Docker is driven through the CLI (via the Tauri shell plugin), never an SDK
  or the Engine API.
- One global Traefik proxy container owns ports 80/443 and routes
  `<name>.test` domains to project containers via Docker labels.
- Generated compose files live in `.dockberth/` inside each user project;
  `templates/` in this repo are the sources they are rendered from.
- Projects on WSL2 paths run compose inside the distro via
  `wsl.exe -d <distro> --cd <path>`; NTFS paths run `docker compose` directly.
- The hosts file is edited only by a separate elevated helper binary.

## Portability

Windows-first, but built to port (macOS/Linux planned for v1.1+). Roughly
**~85% of the codebase is portable**: the entire React/TypeScript layer
(which never branches on OS), template rendering, the project registry,
compose generation, and all Docker interaction — the `docker` /
`docker compose` CLI is identical everywhere, which is exactly why Dockberth
never uses a platform SDK.

Per-platform (isolated in dedicated Rust modules behind common interfaces):

- **Hosts editing + elevation** — UAC/`Start-Process -Verb RunAs` on Windows
  vs `sudo`/polkit elsewhere (`hosts.rs`).
- **WSL2 path handling** — Windows-only concept (`wsl.rs`); other platforms
  get a no-op implementation.
- **Docker engine detection** — Docker Desktop vs engine in WSL vs native
  Linux daemon (`docker.rs`).
- **Packaging** — MSI/NSIS vs dmg vs AppImage/deb (Tauri bundler config).

## Laravel base image

The Laravel template uses `serversideup/php:{phpVersion}-fpm-nginx` — one app
container with nginx + php-fpm supervised together, actively maintained,
Laravel-optimized (opcache, health checks, sane defaults) and available for
every PHP version we target. One container instead of separate nginx/fpm
services keeps the generated compose file and the Services UI simpler; the
image serves HTTP on port 8080, which is what the Traefik service label
points at.

**NTFS caveat:** Windows bind mounts appear root-owned inside containers and
cannot be chown-ed, so the default unprivileged `www-data` workers cannot
write to `storage/`. For projects on NTFS drives, the generated compose runs
the app container as root (`user: root` + `PHP_FPM_CHILD_PROCESS_USER=root`
+ a mounted php-fpm run script adding `--allow-to-run-as-root`). This is
local-dev-only and generated per project; WSL2-hosted projects will keep the
unprivileged default.

## To be written

- Template rendering pipeline and variable model
- Project registry storage format and location
- Traefik network topology and TLS story for `*.test`
- Elevated helper protocol and safety constraints
