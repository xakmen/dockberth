---
title: Add an existing project
description: Point Dockberth at a project you already have — preset detection, the .dockberth folder, and why your code is never touched.
sidebar:
  order: 1
---

Dockberth is built to adopt projects you already have, without changing them.

## Adding a project

1. Click **Add project** and pick the project folder — on an NTFS drive
   (`C:\`, `D:\`) or inside a WSL2 distro, both work.
2. Dockberth looks for framework markers (e.g. `artisan` for Laravel,
   `wp-config.php`/`wp-load.php` for WordPress, `package.json` for Node
   projects) and suggests a matching preset.
3. Confirm the preset and settings (PHP/Node version, database) and the
   project appears in your list, ready to start.

## What gets written — and what doesn't

Everything Dockberth generates lives in a single `.dockberth/` folder inside
the project:

```
your-project/
├── .dockberth/
│   ├── docker-compose.yml   ← rendered from a base template + preset
│   ├── app.Dockerfile       ← thin local image (WSL2 user mapping)
│   └── config.json          ← project settings; the only file you'd edit
└── … your code (never touched)
```

Your source code is **never modified**. Remove the `.dockberth/` folder and
the project from the list, and Dockberth was never there.

:::tip
Add `.dockberth/` to your project's `.gitignore` if you don't want generated
files in version control — or commit `config.json` to share the environment
settings with your team.
:::

## Presets

A preset is a small JSON file describing a framework: which base template to
use (PHP or Node), the docroot, default services, versions. Dockberth ships
presets for WordPress, Laravel, Vendure, and generic PHP/Node — and adding a
new framework is
[a single JSON file](https://github.com/xakmen/dockberth/blob/main/docs/PRESETS.md),
not a fork of the app.
