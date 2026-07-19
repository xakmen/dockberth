# Changelog

All notable changes to Dockberth. Generated from conventional commits
with [git-cliff](https://git-cliff.org).

## [0.1.0] - 2026-07-19

### Features

- global Traefik proxy and end-to-end Laravel projects
- WSL2 project execution — native speed, unprivileged containers
- custom app icon (container-in-berth mark)
- preset-based templates + WordPress, Vendure and generic Node support
- Logs tab, per-service Shell, and project delete — MVP complete
- "New project" mode — WordPress scaffolding from scratch
- release engineering — CI, signed releases, in-app auto-update
- opt-in crash reporting and Report-a-bug diagnostics

### Fixes

- preset openPath and Traefik proxy self-heal
- UI dogfooding batch — overflow, context menu, cursors, status model
- **BREAKING:** hosts file could be wiped on project delete — managed block rework
- WSL distro list unreadable — raw output for wsl.exe
- update updater public key in tauri configuration
- pass Sentry DSN into release builds and enable global Tauri API

