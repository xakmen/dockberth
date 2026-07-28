import { invoke, Channel } from "@tauri-apps/api/core";

/** Mirrors of the Rust types in src-tauri/src/{projects,registry,preset,proxy}.rs. */

/** Single source of truth for a project's lifecycle state.
 * From polling (factual): running | stopped | partial.
 * Transitional (command in flight, overlaid client-side): starting | stopping.
 * error: a lifecycle command timed out, or (per service row) a container
 * crashed / is restart-looping. */
export type ProjectStatus =
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "partial"
  | "error";

export type BaseKind = "php" | "node";

export type DatabaseKind = "mariadb-11" | "mysql-8.4" | "postgres-16";

export type PresetDetect = { files: string[] } | { packageJsonDeps: string[] };

export interface PresetDefaults {
  phpVersion?: string;
  nodeVersion?: string;
  db?: DatabaseKind;
  redis?: boolean;
  startCommand?: string;
}

export interface ScaffoldSpec {
  image: string;
  args: string[];
}

export interface Preset {
  id: string;
  displayName: string;
  base: BaseKind;
  detect: PresetDetect;
  docroot?: string | null;
  defaults: PresetDefaults;
  appPort: number;
  extraServices: string[];
  notes?: string | null;
  openPath?: string | null;
  /** Present when the preset supports "New project" scaffolding. */
  scaffold?: ScaffoldSpec | null;
  /** Post-scaffold configuration step (e.g. WordPress `wp config create`);
   * runs only for freshly scaffolded projects. */
  configure?: ScaffoldSpec | null;
}

export interface ProjectConfig {
  name: string;
  preset?: string | null;
  base?: BaseKind | null;
  phpVersion?: string | null;
  nodeVersion?: string | null;
  db?: DatabaseKind | null;
  redis: boolean;
  dbName?: string | null;
  dbUser?: string | null;
  dbPassword?: string | null;
  startCommand?: string | null;
  appPort?: number | null;
}

export type ProjectLocation =
  | { kind: "wsl"; distro: string; linuxPath: string }
  | { kind: "ntfs"; windowsPath: string };

export interface WslDistro {
  name: string;
  isDefault: boolean;
  version: number;
}

export interface ProjectInfo {
  name: string;
  path: string;
  createdAt: number;
  location: ProjectLocation;
  config: ProjectConfig | null;
  hostsOk: boolean;
  /** Path opened in the browser for this project (preset openPath, "/"). */
  openUrlPath: string;
}

export interface StatusSnapshot {
  projects: Record<string, ProjectStatus>;
  proxyRunning: boolean;
}

export interface DetectResult {
  preset: Preset | null;
  suggestedName: string;
  location: ProjectLocation;
  /** Folder has no entries at all — offer scaffolding instead of an error. */
  empty: boolean;
}

export interface ServiceState {
  name: string;
  state: ProjectStatus;
  image: string;
}

export interface ProxyStatus {
  running: boolean;
  error: string | null;
}

export interface CreateProjectArgs {
  path: string;
  name: string;
  preset: string;
  phpVersion?: string;
  nodeVersion?: string;
  db?: DatabaseKind | null;
  redis: boolean;
  startCommand?: string;
  appPort?: number;
  /** Custom DB credentials; omitted = the "app" defaults. */
  dbName?: string;
  dbUser?: string;
  dbPassword?: string;
}

export const PHP_VERSIONS = ["8.1", "8.2", "8.3", "8.4"] as const;
export const NODE_VERSIONS = ["20", "22"] as const;

export const DB_LABEL: Record<DatabaseKind, string> = {
  "mariadb-11": "MariaDB 11",
  "mysql-8.4": "MySQL 8.4",
  "postgres-16": "PostgreSQL 16",
};

export const DB_IMAGE: Record<DatabaseKind, string> = {
  "mariadb-11": "mariadb:11",
  "mysql-8.4": "mysql:8.4",
  "postgres-16": "postgres:16",
};

export const DB_PORT: Record<DatabaseKind, number> = {
  "mariadb-11": 3306,
  "mysql-8.4": 3306,
  "postgres-16": 5432,
};

/** Sidebar chip per preset id. */
export const PRESET_CHIP: Record<string, string> = {
  laravel: "LARAVEL",
  wordpress: "WP",
  vendure: "NODE",
  "node-generic": "NODE",
};

/** Display name per preset id (configs carry only the id). */
export const PRESET_LABEL: Record<string, string> = {
  laravel: "Laravel",
  wordpress: "WordPress",
  vendure: "Vendure",
  "node-generic": "Node.js app",
};

export const DEFAULT_DOMAIN_SUFFIX = "test";

/** Module-level mirror of settings.domainSuffix. App syncs it whenever
 * settings load or change; every consumer re-renders through App's
 * settings state, so reads after a change always see the new value. */
let currentDomainSuffix = DEFAULT_DOMAIN_SUFFIX;

export function setDomainSuffix(suffix: string): void {
  currentDomainSuffix = isValidDomainSuffix(suffix)
    ? suffix
    : DEFAULT_DOMAIN_SUFFIX;
}

export function projectDomain(name: string): string {
  return `${name}.${currentDomainSuffix}`;
}

/** Mirror of the Rust-side validator (src-tauri/src/domain.rs): dot-
 * separated labels of [a-z0-9]([a-z0-9-]*[a-z0-9])?, each ≤63 chars. */
export function isValidDomainSuffix(suffix: string): boolean {
  return (
    suffix.length > 0 &&
    suffix
      .split(".")
      .every(
        (label) =>
          label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
      )
  );
}

export interface DomainSuffixNote {
  level: "warning" | "info";
  message: string;
}

/** HSTS-preloaded real gTLDs: browsers force HTTPS on every subdomain. */
const HSTS_PRELOADED_TLDS = ["dev", "app", "page", "new", "day", "foo"];

/** Non-blocking note for known-problematic suffixes, matched on the last
 * label so `internal.dev` warns the same way `dev` does. */
export function domainSuffixNote(suffix: string): DomainSuffixNote | null {
  const lastLabel = suffix.split(".").pop() ?? "";
  if (HSTS_PRELOADED_TLDS.includes(lastLabel)) {
    return {
      level: "warning",
      message:
        "Browsers force HTTPS on this suffix (HSTS-preloaded domain); sites will not load without certificates.",
    };
  }
  if (lastLabel === "local") {
    return {
      level: "warning",
      message:
        "Conflicts with mDNS/Bonjour; resolution is unreliable on Windows.",
    };
  }
  if (lastLabel === "localhost") {
    return {
      level: "info",
      message:
        "Browsers resolve *.localhost to loopback automatically; hosts file entries are only needed for CLI tools like curl.",
    };
  }
  return null;
}

/** Mirror of the Rust-side sanitizer: lowercase, [a-z0-9-]. */
export function sanitizeProjectName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isValidProjectName(name: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(name) && name.length <= 63;
}

/** Default DB name/user/password — mirror of template::DEFAULT_DB_NAME on
 * the Rust side; the compose renderer falls back to it for configs missing
 * these fields, so the card must show the same value. */
export const DEFAULT_DB_VALUE = "app";

/** Mirror of the Rust-side is_safe_db_value: safe as an unquoted YAML
 * scalar in the generated compose file. */
export function isValidDbValue(value: string): boolean {
  return /^[A-Za-z0-9_.-]{1,64}$/.test(value);
}

/** Default DB password for new projects — static and predictable on
 * purpose (local dev behind the compose network; Homestead-style). */
export const DEFAULT_DB_PASSWORD = "secret";

/** Project-derived default DB name/user: the project slug with `-` → `_`
 * (hyphens need quoting in SQL). The user is capped at 32 chars — MySQL's
 * user name limit; the name at 64 — matching is_safe_db_value. */
export function derivedDbName(projectName: string): string {
  return projectName.replace(/-/g, "_").slice(0, 64);
}

export function derivedDbUser(projectName: string): string {
  return projectName.replace(/-/g, "_").slice(0, 32);
}

/** Redis connection details. The service ships with no auth and no
 * published port — reachable only from the project's containers. */
export function redisConnection(config: ProjectConfig) {
  if (!config.redis) return null;
  return { host: "redis", port: 6379, url: "redis://redis:6379" };
}

/** DB connection details as rendered into the compose file. */
export function dbConnection(config: ProjectConfig) {
  if (!config.db) return null;
  return {
    host: "db",
    port: DB_PORT[config.db],
    database: config.dbName ?? DEFAULT_DB_VALUE,
    user: config.dbUser ?? DEFAULT_DB_VALUE,
    password: config.dbPassword ?? DEFAULT_DB_VALUE,
  };
}

/** Planned services derived from config — shown while no containers exist. */
export function plannedServices(config: ProjectConfig): ServiceState[] {
  const services: ServiceState[] = [
    {
      name: "app",
      state: "stopped",
      image:
        config.base === "node"
          ? `node:${config.nodeVersion ?? "22"}-bookworm-slim`
          : `serversideup/php:${config.phpVersion ?? "8.3"}-fpm-nginx`,
    },
  ];
  if (config.db) {
    services.push({ name: "db", state: "stopped", image: DB_IMAGE[config.db] });
  }
  if (config.redis) {
    services.push({ name: "redis", state: "stopped", image: "redis:7-alpine" });
  }
  return services;
}

export const listProjects = () => invoke<ProjectInfo[]>("project_list");
export const detectProject = (path: string) =>
  invoke<DetectResult>("detect_project", { path });
export const createProject = (args: CreateProjectArgs) =>
  invoke<ProjectInfo>("project_create", { args });
export const startProject = (name: string) =>
  invoke<void>("project_start", { name });
export const stopProject = (name: string) =>
  invoke<void>("project_stop", { name });
export const restartProject = (name: string) =>
  invoke<void>("project_restart", { name });
export const projectsStatus = () => invoke<StatusSnapshot>("projects_status");
export const projectServices = (name: string) =>
  invoke<ServiceState[]>("project_services", { name });
export const hostsEnsure = (domain: string) =>
  invoke<boolean>("hosts_ensure", { domain });
export const hostsRepair = () => invoke<boolean>("hosts_repair");

export interface Settings {
  /** Local-domain suffix (`<name>.<suffix>`), no leading dot. Changing it
   * must go through applyDomainSuffix, not settingsSet. */
  domainSuffix: string;
}

export interface ApplySuffixResult {
  /** False = the hosts UAC prompt was declined; the setting is applied
   * anyway and "Repair hosts" / per-project "Fix hosts" finish the job. */
  hostsSynced: boolean;
  errors: string[];
}

export const applyDomainSuffix = (suffix: string) =>
  invoke<ApplySuffixResult>("apply_domain_suffix", { suffix });

export interface Diagnostics {
  appVersion: string;
  tauriVersion: string;
  windowsVersion: string;
  docker: string;
  wslDistros: string[];
  projectCount: number;
  presets: string[];
}

export const settingsGet = () => invoke<Settings>("settings_get");
export const settingsSet = (settings: Settings) =>
  invoke<void>("settings_set", { settings });
export const diagnosticsCollect = () =>
  invoke<Diagnostics>("diagnostics_collect");

export type ScaffoldEvent =
  | { type: "line"; line: string; pulling: boolean }
  | { type: "done" }
  | { type: "failed"; error: string };

export const presetList = () => invoke<Preset[]>("preset_list");
export const scaffoldProject = (
  parentPath: string,
  name: string,
  preset: string,
  channel: Channel<ScaffoldEvent>,
) => invoke<void>("scaffold_project", { parentPath, name, preset, channel });
export const scaffoldCancel = (name: string, parentPath: string) =>
  invoke<void>("scaffold_cancel", { name, parentPath });
/** Run the preset's post-scaffold configure step (new projects only). */
export const scaffoldConfigure = (
  path: string,
  name: string,
  preset: string,
  creds: { dbName: string; dbUser: string; dbPassword: string },
) => invoke<void>("scaffold_configure", { path, name, preset, ...creds });

/** `<parent>/<name>` using the parent's own separator style. */
export function joinPath(parent: string, name: string): string {
  const sep = parent.includes("\\") ? "\\" : "/";
  return parent.endsWith(sep) ? `${parent}${name}` : `${parent}${sep}${name}`;
}

/** Parent folder of a path (both separator styles). */
export function parentPathOf(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  const index = Math.max(trimmed.lastIndexOf("\\"), trimmed.lastIndexOf("/"));
  return index > 0 ? trimmed.slice(0, index) : trimmed;
}
export const proxyEnsure = () => invoke<ProxyStatus>("proxy_ensure");
export const wslListDistros = () => invoke<WslDistro[]>("wsl_list_distros");
export const wslCheckDocker = (distro: string) =>
  invoke<void>("wsl_check_docker", { distro });
export const openProjectFolder = (name: string) =>
  invoke<void>("project_open_folder", { name });
export const openProjectEditor = (name: string) =>
  invoke<void>("project_open_editor", { name });
export const openProjectShell = (name: string, service: string) =>
  invoke<void>("project_open_shell", { name, service });

export type LogEvent =
  | { type: "line"; line: string; stderr: boolean }
  | { type: "end"; error: string | null };

export const logsStart = (
  name: string,
  services: string[],
  channel: Channel<LogEvent>,
) => invoke<void>("logs_start", { name, services, channel });
export const logsStop = (name: string) => invoke<void>("logs_stop", { name });

export interface DeleteOptions {
  removeContainers: boolean;
  removeHosts: boolean;
  removeVolumes: boolean;
  removeDockberthDir: boolean;
}

export interface DeleteResult {
  hostsRemoved: boolean;
}

export const deleteProject = (name: string, options: DeleteOptions) =>
  invoke<DeleteResult>("project_delete", { name, options });
