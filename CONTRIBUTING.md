# Contributing to Dockberth

Thanks for helping! Issues and pull requests are welcome.

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

## Getting started

```sh
npm install
npm run tauri dev
```

Windows prerequisites: Node.js ≥ 20, Rust (stable, MSVC toolchain), and the
[Tauri prerequisites](https://tauri.app/start/prerequisites/).
