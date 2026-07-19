# Framework presets

Dockberth generates each project's Docker environment from a **base
template** plus a **framework preset**. A base template
(`templates/php/docker-compose.yml`, `templates/node/docker-compose.yml`)
defines the services and wiring for a whole runtime family; a preset is a
small JSON file that specializes it for one framework. **Adding support for
a new framework usually means adding one preset file — no Rust required.**

## Where things live

```
templates/
  php/
    docker-compose.yml     ← PHP base (serversideup/php app + db + extras)
    app.Dockerfile         ← WSL2 UID-remap image (shared by all PHP presets)
    presets/
      laravel.json
      wordpress.json
  node/
    docker-compose.yml     ← Node base (node:{version} app, optional db)
    presets/
      vendure.json
      node-generic.json
```

Presets are embedded into the app binary at compile time and registered in
`src-tauri/src/preset.rs` (`PRESET_SOURCES`) — add your file there too, in
the right precedence position (see below).

## Annotated example

```jsonc
{
  // Unique id: lowercase, also stored in .dockberth/config.json.
  "id": "laravel",

  // Shown in the new-project dialog and on the Overview tab.
  "displayName": "Laravel",

  // Which base template to render: "php" | "node".
  "base": "php",

  // How to recognize a project folder. Two forms:
  //   { "files": ["artisan"] }            — ALL listed files must exist
  //   { "packageJsonDeps": ["@vendure/core"] }
  //                                       — package.json contains ANY of
  //                                         the deps (dependencies or
  //                                         devDependencies). An empty
  //                                         list matches any folder with
  //                                         a package.json.
  "detect": { "files": ["artisan"] },

  // PHP base only: web root relative to the project root.
  // "public" → nginx serves /var/www/html/public; "." → the project root.
  "docroot": "public",

  // Prefills for the new-project dialog. All optional. db uses concrete
  // ids: "mariadb-11" | "mysql-8.4" | "postgres-16"; omit for "no db".
  "defaults": { "phpVersion": "8.3", "db": "mariadb-11", "redis": true },

  // Container port Traefik routes <name>.test to. For the PHP base this
  // is always 8080 (serversideup/php). Node projects may override it per
  // project in the dialog.
  "appPort": 8080,

  // Optional services defined in the base compose behind section markers,
  // e.g. "wpcli" (PHP base). Listed sections get enabled.
  "extraServices": [],

  // PHP base only: extra PHP extensions baked into the app image via
  // install-php-extensions (WordPress needs "mysqli"). A non-empty list
  // switches the app service from the stock image to a local build of
  // .dockberth/app.Dockerfile on every platform.
  "phpExtensions": [],

  // One or two sentences shown in the dialog after detection: what the
  // user should know to wire their existing code to the environment.
  "notes": "Point DB_HOST at `db` in your .env.",

  // Optional path appended to http://<name>.test by "Open in browser"
  // and the header domain link (Vendure: "/dashboard"). Default "/".
  "openPath": "/"
}
```

## Detection precedence

Presets are tried **in the order they appear in `PRESET_SOURCES`** and the
first match wins. Order them specific-before-generic:

1. `laravel` — `artisan` file
2. `wordpress` — `wp-settings.php`
3. `vendure` — `@vendure/core` in package.json
4. `node-generic` — any package.json (catch-all)

A Laravel app also has a package.json (vite) — it must match `laravel`, not
`node-generic`; that's what the ordering guarantees. Put new presets with
file markers or scoped dependencies **before** `node-generic`.

## Section markers and placeholders

Base templates use two constructs (rendered by `src-tauri/src/template.rs`):

- `{placeholder}` — substituted values (`{project}`, `{php_version}`,
  `{app_port}`, `{db_image}`, …).
- `#[section:name]` … `#[/section]` — lines kept or dropped per
  configuration. Sections nest. Some are driven by the renderer itself
  (`ntfs_root`, `wsl_build`, `node_modules_overlay`, `db_mysql`, …); the
  ones listed in `extraServices` are driven by your preset.

Do **not** fork a base template for a new framework. If the base genuinely
lacks something, add a new section to it behind a marker and reference it
from your preset via `extraServices`.

## Testing a preset locally

1. Add the JSON file under `templates/<base>/presets/` and register it in
   `PRESET_SOURCES` (`src-tauri/src/preset.rs`) at the right precedence.
2. `cargo test` in `src-tauri/` — add a detection test in `preset.rs` and,
   if your preset toggles sections, a render test in `template.rs`
   (assert the rendered compose contains/lacks the right lines).
3. `npm run tauri dev`, point the new-project dialog at a real project of
   that framework: the dialog must show your `displayName` and `notes`.
4. Create + start the project and check `http://<name>.test` responds.

That's it — the dialog fields, the Overview cards, and start/stop routing
all derive from the preset's `base`; nothing else to wire.
