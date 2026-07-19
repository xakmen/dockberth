import { invoke } from "@tauri-apps/api/core";

/** Mirrors of the Rust types in src-tauri/src/{projects,registry,preset,proxy}.rs. */

export type ProjectStatus = "running" | "starting" | "stopped" | "error";

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

export function projectDomain(name: string): string {
  return `${name}.test`;
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

/** DB connection details as rendered into the compose file. Legacy configs
 * (pre-preset milestones) rendered "laravel" for name/user/password. */
export function dbConnection(config: ProjectConfig) {
  if (!config.db) return null;
  return {
    host: "db",
    port: DB_PORT[config.db],
    database: config.dbName ?? "laravel",
    user: config.dbUser ?? "laravel",
    password: config.dbPassword ?? "laravel",
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
export const proxyEnsure = () => invoke<ProxyStatus>("proxy_ensure");
export const wslListDistros = () => invoke<WslDistro[]>("wsl_list_distros");
export const wslCheckDocker = (distro: string) =>
  invoke<void>("wsl_check_docker", { distro });
export const openProjectFolder = (name: string) =>
  invoke<void>("project_open_folder", { name });
export const openProjectEditor = (name: string) =>
  invoke<void>("project_open_editor", { name });
