# dockberth.dev

The Dockberth website — landing page + documentation, built with
[Astro](https://astro.build) + [Starlight](https://starlight.astro.build).
Deployed to GitHub Pages at <https://dockberth.dev> by
`.github/workflows/pages.yml` on every push to `main` that touches `site/`
or the root `CHANGELOG.md`.

## Development

```sh
cd site
npm install
npm run dev       # http://localhost:4321
npm run build     # output in dist/
```

Note: `/changelog/` renders the repo-root `CHANGELOG.md` at build time.
That file lives outside the Vite root, so the dev server won't hot-reload
it — restart `npm run dev` to see changelog edits locally.

## Conventions

- **Dark-only** — the theme toggle is removed (`src/components/ThemeSelect.astro`)
  and dark is forced (`src/components/ThemeProvider.astro`).
- **Brand tokens** live in `src/styles/brand.css` and mirror the app theme
  in `/src/globals.css` — keep them in sync when the app palette changes.
- **Copied assets**: `src/assets/screenshot*.png` are copies of
  `/docs/screenshot*.png`; `src/assets/icon.svg` and `public/favicon.svg`
  are copies of `/design/icon/icon.svg`. Re-copy when the originals change.
- The landing page is `src/pages/index.astro` (outside Starlight); docs live
  in `src/content/docs/`.
