# Dockberth

**Local dev environments for any stack — Docker under the hood, GUI on top.**

Dockberth is a Windows desktop app that spins up ready-to-code local
environments for Laravel, WordPress, and Vendure/Node projects. It generates
Docker Compose files from templates, routes every project through a global
Traefik proxy as `https://<name>.test` (suffix configurable), and keeps your
hosts file in sync — no terminal required.

## Features (MVP)

- **One-click environments** for Laravel, WordPress, Vendure, and generic
  Node/PHP projects from built-in presets (roadmap: Yii, CodeIgniter,
  OpenCart, Drupal — post-dogfooding)
- **Create new WordPress projects from scratch** — only Docker required,
  no local PHP/WP-CLI (Laravel and Vendure scaffolding coming next)
- **Pretty local domains** — every project served as `<name>.<suffix>`
  (default `test`, configurable in Settings) through a shared Traefik proxy
  on ports 80/443
- **Hosts file managed for you** via a small elevated helper (single UAC
  prompt, surgical edits only)
- **WSL2-aware** — projects living inside a WSL2 distro run compose in-distro
  for fast filesystem performance; NTFS projects run natively
- **Non-invasive** — generated files stay in a `.dockberth/` folder inside
  your project; delete it and Dockberth was never there
- **Docker status at a glance** — see whether the daemon is up before you hit
  start

## Privacy

Crash reporting is **opt-in** and heavily scrubbed (no usernames, project
names or paths ever leave your machine) — see
[docs/TELEMETRY.md](docs/TELEMETRY.md) for exactly what is sent.

## License

**The Dockberth core is MIT-licensed, forever.** See [LICENSE](LICENSE).

## Development

Prerequisites: Node.js ≥ 20, Rust (stable, MSVC), and the
[Tauri prerequisites](https://tauri.app/start/prerequisites/) for Windows.

```sh
npm install
npm run tauri dev
```

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request, and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit together.
