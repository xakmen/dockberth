---
title: Troubleshooting
description: Fixes for the usual suspects — busy ports 80/443, Docker not running, UAC prompts, and domains that won't resolve.
sidebar:
  order: 1
---

## Ports 80 or 443 are already in use

The shared Traefik proxy needs ports 80 and 443. If another program holds
them, the proxy can't start and project domains won't load. Find the
culprit in an elevated PowerShell:

```powershell
Get-Process -Id (Get-NetTCPConnection -LocalPort 80,443 -State Listen).OwningProcess |
  Select-Object Id, ProcessName -Unique
```

Usual suspects: IIS / "World Wide Web Publishing Service" (`W3SVC`), XAMPP
or Laragon's Apache/nginx, or another local proxy. Stop or reconfigure the
conflicting service, then start your project again — Dockberth will bring
the proxy up automatically.

## Docker Desktop isn't running

Dockberth shows Docker's status at a glance and can **start Docker Desktop
for you** — click the prompt in the app instead of hunting for the whale
icon. If Docker is installed but the status stays red, start Docker Desktop
manually once and check its own error output (WSL2 update required,
virtualization disabled in BIOS, etc.).

## A UAC prompt appeared — is that normal?

Yes. Windows requires administrator rights to edit the hosts file. Dockberth
itself never runs elevated; when your project domains change it launches a
small helper for the single write, which is what triggers the prompt. It
edits only the Dockberth-managed block — see
[Domains and the hosts file](/guides/domains-and-hosts/). If you decline the
prompt, containers still run; the `.test` domain just won't resolve until
the hosts entry is written.

## `myapp.test` doesn't resolve

- Check the hosts file (`C:\Windows\System32\drivers\etc\hosts`) contains
  the domain inside the `DOCKBERTH MANAGED BLOCK`. If not, restart the
  project and accept the UAC prompt.
- Flush the DNS cache: `ipconfig /flushdns`.
- Some browsers try a search engine for unknown TLDs — type the full
  `http://myapp.test` including the scheme.

## The project starts but the site shows an error

- Open the **Logs** tab and filter to the app or database service — most
  failures (bad database credentials, missing vendor folder, syntax errors)
  are right there.
- Node projects on NTFS: dependencies must be installed *inside* the
  container — open a shell and run `npm install`. See
  [WSL2 and file paths](/guides/wsl2-and-file-paths/).

## Still stuck?

Use **Report a bug** in the app — it collects versions and counts (never
names or paths), shows you the exact payload, and opens a prefilled GitHub
issue that you submit yourself. Or open an issue directly at
[github.com/xakmen/dockberth](https://github.com/xakmen/dockberth/issues).
