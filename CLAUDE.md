# Dockberth — project context

Dockberth is an open-source Windows desktop GUI app that manages Docker-based
local dev environments (Laravel, WordPress, Vendure/Node). It generates
docker-compose files from templates, routes projects through a global Traefik
proxy as `<name>.test`, and edits the Windows hosts file via an elevated
helper.

## Settled decisions — do not relitigate

- **Stack**: Tauri 2 + React + TypeScript + Vite; npm as package manager.
- **Docker via CLI only**, invoked through the Tauri shell plugin. No Docker
  SDK, no direct Engine API calls.
- **Thin Rust side**: `src-tauri` contains only command wrappers around
  external CLIs (`docker.rs`, `wsl.rs`, `hosts.rs`). Business logic (template
  rendering, project registry, orchestration flow) lives in the React
  frontend.
- **Global Traefik proxy** — one container owning host ports 80/443, routing
  `<name>.test` domains to project containers via Docker labels.
- **Generated compose files** are written to `.dockberth/` inside each user
  project. Sources live in `templates/` (laravel, wordpress, vendure, proxy).
- **Path handling**: projects on WSL2 paths run compose inside the distro via
  `wsl.exe -d <distro> --cd <path>`; projects on NTFS run `docker compose`
  directly on Windows.
- **Hosts file editing** happens only through a separate elevated helper
  binary (UAC), never from the main app process. Dockberth-managed entries
  live in a marked block.

## Code style

- TypeScript `strict` mode; keep it passing with zero errors.
- Identifiers and comments in English.
- Frontend layout: `src/components/`, `src/pages/`, `src/hooks/`,
  `src/lib/` (Tauri invoke wrappers and pure logic live in `lib/`).
- Rust commands return raw results (stdout/exit codes/typed structs); no
  hidden retries or business decisions on the Rust side.

## MVP scope

1. Dashboard with Docker daemon status (done: `docker_version` command +
   status card).
2. Create project from a template (Laravel / WordPress / Vendure) →
   render compose into `<project>/.dockberth/`.
3. Start/stop projects (`docker compose up -d` / `down`), with the WSL2 vs
   NTFS execution split.
4. Global Traefik proxy lifecycle (install/start/stop) + `dockberth` Docker
   network.
5. Hosts sync for `<name>.test` via the elevated helper.

Out of scope for MVP: TLS certificates, remote Docker hosts, macOS/Linux
builds, template marketplace, per-service log UI.

## Commands

- `npm run tauri dev` — run the app in dev mode.
- `npm run build` — typecheck (`tsc`) and build the frontend.
- `cargo check` in `src-tauri/` — fast Rust validation.

## Licensing

MIT (core, forever). Contributions require DCO sign-off (`git commit -s`);
there is no CLA.
