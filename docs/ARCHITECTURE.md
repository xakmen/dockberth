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

## To be written

- Template rendering pipeline and variable model
- Project registry storage format and location
- Traefik network topology and TLS story for `*.test`
- Elevated helper protocol and safety constraints
