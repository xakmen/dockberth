---
title: Installation
description: Download and install Dockberth on Windows — installer, SmartScreen note, and signed auto-updates.
sidebar:
  order: 3
---

1. Download the installer from the
   [latest release](https://github.com/xakmen/dockberth/releases/latest).
2. Run it and follow the prompts.
3. Launch Dockberth. On first start you'll be asked once whether to enable
   opt-in crash reporting (see [Privacy](/reference/privacy/)) — nothing is
   sent unless you say yes.

## SmartScreen

Windows SmartScreen may warn about a new publisher the first time you run
the installer. If you see "Windows protected your PC", click
**More info → Run anyway**. You can verify what you downloaded by comparing
the file against the checksums published with each
[GitHub release](https://github.com/xakmen/dockberth/releases).

## Staying up to date

Dockberth keeps itself current with **signed auto-updates**: each release is
cryptographically signed, and the app verifies the signature before applying
an update. You don't need to re-download installers manually.

## Uninstalling

Uninstall Dockberth like any Windows app (Settings → Apps). Your projects
are untouched — anything Dockberth generated lives in a `.dockberth/` folder
inside each project, which you can delete whenever you like. If you had
running projects, stop them first so their containers are removed cleanly.
