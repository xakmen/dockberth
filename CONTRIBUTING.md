# Contributing to Dockberth

Thanks for helping! Issues and pull requests are welcome.

## Branches and pull requests

`main` is protected — every change (code, docs, CI alike) lands through a
pull request with CI green, **squash-merged**. Branch names follow the
commit types: `feat/<slug>`, `fix/<slug>`, `docs/<slug>`, `chore/<slug>`,
… For work on an existing issue, use `<type>/<issue-number>-<slug>` and
add `Closes #N` to the PR body.

The **PR title must itself be a valid conventional commit** — on merge it
becomes the commit message on `main` and feeds the changelog. Commit
granularity inside your branch is up to you; it all squashes down.

## Developer Certificate of Origin (DCO)

There is **no CLA**. Instead, every commit must be signed off under the
[Developer Certificate of Origin](https://developercertificate.org/) — a
lightweight statement that you have the right to submit the code under the
project's MIT license.

Sign off by adding a line to your commit message:

```
Signed-off-by: Your Name <your.email@example.com>
```

Git does this for you when you commit with the `-s` flag:

```sh
git commit -s -m "fix: describe your change"
```

The name and email are taken from your `user.name` / `user.email` git config.
Pull requests with unsigned commits can't be merged; if you forgot, amend
with `git commit --amend -s` (or `git rebase --signoff` for multiple commits)
and force-push your branch.

## Ground rules

- TypeScript is `strict`; keep it that way.
- Identifiers and comments are in English.
- Keep the Rust side thin — business logic belongs in the frontend; Rust
  commands wrap external CLIs and return raw results.
- Match the existing code style around whatever you touch.

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org)
(`feat:`, `fix:`, `docs:`, `chore:`, …) — CHANGELOG.md is generated from
them, and `feat`/`fix` land in release notes while `chore`/`ci`/`test`
are filtered out. Keep a **blank line between the summary and the body**.
If you commit from VS Code, enable **Git: Always Sign Off** in settings
so the DCO trailer is added automatically.

## Getting started

```sh
npm install
npm run tauri dev
```

Windows prerequisites: Node.js ≥ 20, Rust (stable, MSVC toolchain), and the
[Tauri prerequisites](https://tauri.app/start/prerequisites/).
