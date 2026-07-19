// Version sync: package.json is the single source of truth.
// Wired into `npm version` (see package.json "version" script) so
// src-tauri/Cargo.toml, tauri.conf.json and Cargo.lock always match.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const write = (p, content) => writeFileSync(join(root, p), content);

const version = JSON.parse(read("package.json")).version;
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`sync-version: suspicious version '${version}' — aborting`);
  process.exit(1);
}

// tauri.conf.json — parse, set, re-serialize (2-space, trailing newline).
const confPath = "src-tauri/tauri.conf.json";
const conf = JSON.parse(read(confPath));
if (conf.version !== version) {
  conf.version = version;
  write(confPath, JSON.stringify(conf, null, 2) + "\n");
}

// Cargo.toml — replace only the [package] version line (first match).
const cargoPath = "src-tauri/Cargo.toml";
const cargo = read(cargoPath).replace(
  /^version = ".*"$/m,
  `version = "${version}"`,
);
write(cargoPath, cargo);

// Cargo.lock — keep the dockberth package entry in sync so `npm version`
// commits a consistent lockfile without needing a cargo run.
const lockPath = "src-tauri/Cargo.lock";
const lock = read(lockPath).replace(
  /(\[\[package\]\]\r?\nname = "dockberth"\r?\nversion = ")[^"]+(")/,
  `$1${version}$2`,
);
write(lockPath, lock);

console.log(`sync-version: ${version} → tauri.conf.json, Cargo.toml, Cargo.lock`);
