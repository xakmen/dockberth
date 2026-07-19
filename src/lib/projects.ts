import { invoke } from "@tauri-apps/api/core";

/** Mirrors of the Rust types in src-tauri/src/{projects,registry,proxy}.rs. */

export type ProjectStatus = "running" | "starting" | "stopped" | "error";

export type StackKind = "laravel";

export type DatabaseKind = "mariadb-11" | "mysql-8.4" | "postgres-16";

export interface ProjectConfig {
  name: string;
  stack: StackKind;
  phpVersion: string;
  db: DatabaseKind;
  redis: boolean;
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
}

export interface DetectResult {
  stack: "laravel" | "unknown";
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
  phpVersion: string;
  db: DatabaseKind;
  redis: boolean;
}

export const PHP_VERSIONS = ["8.1", "8.2", "8.3", "8.4"] as const;

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

export const STACK_CHIP: Record<StackKind, string> = {
  laravel: "LARAVEL",
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

/** Planned services derived from config — shown while no containers exist. */
export function plannedServices(config: ProjectConfig): ServiceState[] {
  const services: ServiceState[] = [
    {
      name: "app",
      state: "stopped",
      image: `serversideup/php:${config.phpVersion}-fpm-nginx`,
    },
    { name: "db", state: "stopped", image: DB_IMAGE[config.db] },
  ];
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
export const projectsStatus = () =>
  invoke<Record<string, ProjectStatus>>("projects_status");
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
