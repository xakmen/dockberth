# Changelog

All notable changes to Dockberth. Generated from conventional commits
with [git-cliff](https://git-cliff.org).

## [0.1.3] - 2026-07-21

### Features

- dockberth.dev website — landing, docs, changelog, Pages deploy
- **BREAKING:** remove Sentry crash reporting entirely

### Fixes

- keep the Logs view updating after the buffer fills (#31)
- reserve the proxy/dockberth project namespace (#32)
- read the hosts file as bytes so non-UTF-8 comments don't break it (#33)
- escape $ in rendered compose values so start commands survive (#34)
- do not auto-start project services with Docker (#35)
- bind the proxy to loopback and drop the unused 443 publish (#36)
- launch VS Code without cmd /C to prevent argument injection (#37)
- write persisted files atomically (temp + rename) (#38)
- serialize registry mutations to prevent lost project entries (#39)
- own the log-follower lifecycle to prevent PID-reuse kills and leaks (#40)
- validate compose credentials, service args and non-ASCII names (#41)
- make scaffold cancel actually abort a hung run (#42)
- make proxy heal and status timeouts fire without a live poll (#43)
- surface silent frontend failures and guard the updater (#44)
- correct new-project wizard base, port and scaffold recovery (#45)

### Documentation

- real app screenshots — project statuses, logs, scaffolding dialog
- adopt GitHub flow for all changes (#1)

## [0.1.2] - 2026-07-19

### Features

- update sidebar logo to new berth and container glyph
- enhance dark theme support and custom scrollbar styles
- add preloader with fade-out effect and background color to enhance user experience
- configurable domain suffix
- improve layout responsiveness and add min-width to input fields
- add support for starting Docker Desktop and enhance status reporting
- update features section with new entries and refactor context menu logic

### Refactoring

- simplify context menu suppression logic in useContextMenuGuard

## [0.1.1] - 2026-07-19

### Features

- enforce a 900x600 minimum window size

### Fixes

- stop wt.exe from splitting the shell command on semicolons
- bundle identifier without .app suffix

### Documentation

- release guide, project status refresh, contributor commit rules

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

