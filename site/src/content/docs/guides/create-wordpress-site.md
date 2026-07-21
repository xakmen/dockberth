---
title: Create a WordPress site
description: Scaffold a fresh WordPress site with only Docker installed — no local PHP or WP-CLI required.
sidebar:
  order: 2
---

Dockberth can create a complete WordPress site from scratch. The only thing
you need installed is Docker — no local PHP, no WP-CLI.

## How it works

When you click **New project** and choose WordPress, Dockberth runs a
**one-off container** (`wordpress:cli`) that downloads WordPress core
straight into your target folder. Your machine's toolchain is never
involved; when the download finishes, the normal project pipeline takes
over — compose generation, database, local domain — exactly as if you had
added an existing WordPress project.

## Walkthrough

1. **New project** → pick a name (it becomes `<name>.test`) and a location.
   The location can be an empty NTFS folder or a path inside a WSL2 distro.
2. Choose the **WordPress** stack, a PHP version and a database.
3. Dockberth scaffolds the site, generates the environment and starts it.
4. Open `http://<name>.test` and run the famous five-minute WordPress
   install in your browser.

The stack includes a `wpcli` companion container, so WP-CLI commands are
available against your site without installing anything locally — open a
shell from the UI (see [Logs and shell](/guides/logs-and-shell/)).

## Safety and cleanup

Scaffolding is careful about your filesystem:

- If Dockberth created the target folder and the scaffold fails or you
  cancel, the folder is deleted entirely.
- If you pointed it at a pre-existing empty folder, that folder is emptied
  again — nothing outside the target is ever touched.

## Laravel and Vendure

Scaffolding for Laravel and Vendure is on the roadmap — running *existing*
Laravel and Vendure projects is already supported.
