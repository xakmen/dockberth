# Changelog

All notable changes to Dockberth. Generated from conventional commits
with [git-cliff](https://git-cliff.org).

## [Unreleased]

### Features

- custom app icon (container-in-berth mark)
- release engineering — CI, signed releases, in-app auto-update
- opt-in crash reporting and Report-a-bug diagnostics

### Fixes

- UI dogfooding batch — overflow, context menu, cursors, status model
- **BREAKING:** hosts file could be wiped on project delete — managed block rework
- WSL distro list unreadable — raw output for wsl.exe
- update updater public key in tauri configuration
- pass Sentry DSN into release builds and enable global Tauri API

