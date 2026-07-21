# Releasing Dockberth

## TL;DR

```powershell
npm run changelog                 # refresh CHANGELOG.md, commit it
npm version 0.2.0                 # bumps package.json; sync-version.mjs
                                  # updates Cargo.toml, tauri.conf.json,
                                  # Cargo.lock; creates commit + tag v0.2.0
git push --follow-tags            # tag v* triggers the Release workflow
```

Then: **Actions** → wait for "Release" (~15–25 min) → **Releases** → the
draft appears with the NSIS installer, its `.sig` and `latest.json`, and
its description pre-filled with this version's git-cliff section →
review/edit the notes → **Publish**.

## Rules and gotchas

- **package.json is the single source of truth** for the version. Never
  edit versions in Cargo.toml / tauri.conf.json by hand — `npm version`
  runs `scripts/sync-version.mjs` for you.
- **Never tick "Set as a pre-release"** on the GitHub release — the
  auto-updater reads `releases/latest/download/latest.json`, and GitHub's
  `latest` ignores pre-releases. An rc published as pre-release is
  invisible to installed apps.
- Releases are **drafts by design** — notes are reviewed by a human
  before publishing.
- CHANGELOG.md is generated from conventional commits (`cliff.toml`);
  `chore:`/`ci:`/`test:` commits are intentionally excluded. A commit
  body must be separated from the summary by a blank line (a
  preprocessor repairs missing ones, but don't rely on it).

## Required GitHub Actions secrets

| Secret | Purpose |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | Updater artifact signing (private key stays offline with the maintainer) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password for the key above |

The updater public key lives in `tauri.conf.json` (`plugins.updater.pubkey`).
Rotating the keypair orphans existing installs (they can't verify new
updates) — don't, unless compromised.

## Verifying the update path

Install the previous release, publish a new one, launch the installed
app: the "Dockberth vX.Y is available — Restart to update" banner should
appear within seconds (silent startup check). The app never restarts
without the user clicking the banner.
