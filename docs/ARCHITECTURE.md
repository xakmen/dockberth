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

## Base templates + framework presets

Environments are generated from a **base template** (one per runtime
family) specialized by a **framework preset** (a small JSON file) — see
[PRESETS.md](PRESETS.md) for the contributor guide.

- **PHP base** (`templates/php/`): `serversideup/php:{phpVersion}-fpm-nginx`
  — one app container with nginx + php-fpm supervised together, actively
  maintained, Laravel-optimized (opcache, health checks, sane defaults).
  One container instead of separate nginx/fpm services keeps the generated
  compose and the Services UI simpler. It serves HTTP on **8080**; the
  preset's `docroot` sets `NGINX_WEBROOT` (`public` for Laravel, the
  project root for WordPress). Optional sections: redis, mailpit, adminer,
  and a `wpcli` companion (compose profile `tools`, WordPress preset).
- **Node base** (`templates/node/`): `node:{nodeVersion}-bookworm-slim`,
  project bind-mounted at `/app`, dev server launched via the configured
  start command (`sh -lc "npm run dev"` by default) with `HOST=0.0.0.0`
  and `PORT` set. Database (postgres/mysql) and redis are optional
  sections.

**Traefik wiring:** every app container carries labels routing
`Host(<name>.test)` to the preset's `appPort` (8080 for PHP, per-project
for Node, 3000 default). The proxy only sees containers on the external
`dockberth` network (`exposedByDefault=false`).

**node_modules asymmetry (Node base):** on NTFS projects the generated
compose overlays an **anonymous volume** on `/app/node_modules` — a
bind-mounted node_modules on a Windows drive is unusably slow and native
modules built on Windows don't run in Linux containers. Consequence: with
the overlay active, `npm install` must run *inside* the container
(`docker compose exec app npm install`). WSL2 projects mount node_modules
straight through at native speed — installs work from either side.

**NTFS caveat:** Windows bind mounts appear root-owned inside containers and
cannot be chown-ed, so the default unprivileged `www-data` workers cannot
write to `storage/`. For projects on NTFS drives, the generated compose runs
the app container as root (`user: root` + `PHP_FPM_CHILD_PROCESS_USER=root`
+ a mounted php-fpm run script adding `--allow-to-run-as-root`). This is
local-dev-only and generated per project.

**WSL2 projects stay unprivileged:** bind-mounted files belong to the distro
user (e.g. uid 1000), not to the image's `www-data` (uid 33). The generated
environment therefore builds a thin local image (`.dockberth/app.Dockerfile`)
that remaps `www-data` to the distro user's UID/GID via serversideup's
`docker-php-serversideup-set-id` — the supported local-dev pattern. The
container keeps running as `www-data`, writes work, and files created inside
the container belong to the distro user on the host.

## Scaffolding ("New project" mode)

New projects are scaffolded by a **one-off container run** defined by the
preset's `scaffold` spec (image + args) with the target folder mounted at
the base's app dir — e.g. WordPress: `wordpress:cli wp core download`.
No local toolchain is required, only Docker.

- **Location-aware user mapping**, same policy as the runtime: WSL2
  targets run inside the distro with `--user <uid>:<gid>` of the distro
  user (files belong to the user); NTFS targets run as root (consistent
  with the NTFS runtime container).
- **Cleanup semantics:** on failure or cancel, only what the scaffold
  produced is removed — a folder Dockberth created is deleted entirely; a
  pre-existing (empty) target is emptied again. Nothing outside the
  target is ever touched. Cancel force-removes the named scaffold
  container (`dockberth-scaffold-<name>`), which ends the `docker run`
  client and triggers the cleanup.
- After a successful download the normal create pipeline takes over —
  detection finds the framework markers and the preset flow (compose
  generation, hosts, start) is identical to onboarding an existing
  project.

## Hosts management

All Dockberth entries live inside one managed block in the Windows hosts
file (`# BEGIN/END DOCKBERTH MANAGED BLOCK`); everything outside it is
user territory, preserved byte-for-byte. There is a single write path:
the full new content is rendered and sanity-checked in Rust (lossless
roundtrip proof, abort on unterminated block, no-op without changes) and
the elevated PowerShell script only does backup → tmp → move. Content
logic never runs elevated — the pre-rework implementation filtered inside
PowerShell and could truncate the whole file on a locked read.

A rework replacing per-change UAC prompts entirely (wildcard `.test` DNS
via NRPT + a dnsmasq container vs a small Windows service) is designed
but not yet decided.

## To be written

- Traefik TLS story for `*.test`
- Project registry format guarantees (currently: `projects.json` in the
  app data dir + per-project `.dockberth/config.json` as source of truth)
