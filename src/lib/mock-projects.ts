/** Mock project data matching the design mockups. Will be replaced by real
 * state (project registry + docker inspection) in a later milestone. */

export type ProjectStatus = "running" | "starting" | "stopped" | "error";

export type StackKind = "wordpress" | "laravel" | "node";

export interface ProjectService {
  name: string;
  status: ProjectStatus;
  /** Version / ports summary shown next to the service name. */
  meta: string;
}

export type ProjectLocation =
  | { kind: "wsl"; distro: string }
  | { kind: "ntfs" };

export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  stack: StackKind;
  /** Human-readable stack line for the Stack card, e.g. "WordPress 6.7". */
  stackLabel: string;
  /** Runtime row for the Stack card, e.g. { label: "PHP", value: "8.3" }. */
  runtime: { label: string; value: string };
  database: string;
  domain: string;
  path: string;
  location: ProjectLocation;
  services: ProjectService[];
}

export const STACK_CHIP: Record<StackKind, string> = {
  wordpress: "WP",
  laravel: "LARAVEL",
  node: "NODE",
};

export const MOCK_PROJECTS: Project[] = [
  {
    id: "aquashop",
    name: "aquashop",
    status: "running",
    stack: "wordpress",
    stackLabel: "WordPress 6.7",
    runtime: { label: "PHP", value: "8.3" },
    database: "MariaDB 10.11",
    domain: "aquashop.test",
    path: "\\\\wsl$\\Ubuntu-22.04\\home\\dev\\sites\\aquashop",
    location: { kind: "wsl", distro: "Ubuntu-22.04" },
    services: [
      { name: "nginx", status: "running", meta: "1.27 · port 80, 443" },
      { name: "php-fpm", status: "running", meta: "8.3.14" },
      { name: "mariadb", status: "running", meta: "10.11 · port 3306" },
      { name: "redis", status: "running", meta: "7.4 · port 6379" },
      { name: "mailpit", status: "running", meta: "SMTP 1025 · UI 8025" },
    ],
  },
  {
    id: "chandlery",
    name: "chandlery",
    status: "running",
    stack: "node",
    stackLabel: "Vendure 3.2",
    runtime: { label: "Node", value: "22" },
    database: "PostgreSQL 16",
    domain: "chandlery.test",
    path: "\\\\wsl$\\Ubuntu-22.04\\home\\dev\\sites\\chandlery",
    location: { kind: "wsl", distro: "Ubuntu-22.04" },
    services: [
      { name: "server", status: "running", meta: "Vendure 3.2 · port 3000" },
      { name: "worker", status: "running", meta: "job queue" },
      { name: "postgres", status: "running", meta: "16 · port 5432" },
      { name: "redis", status: "running", meta: "7.4 · port 6379" },
    ],
  },
  {
    id: "portside-api",
    name: "portside-api",
    status: "starting",
    stack: "laravel",
    stackLabel: "Laravel 12",
    runtime: { label: "PHP", value: "8.4" },
    database: "MySQL 8.4",
    domain: "portside-api.test",
    path: "C:\\Users\\dev\\sites\\portside-api",
    location: { kind: "ntfs" },
    services: [
      { name: "nginx", status: "starting", meta: "1.27 · port 80, 443" },
      { name: "php-fpm", status: "starting", meta: "8.4.2" },
      { name: "mysql", status: "starting", meta: "8.4 · port 3306" },
      { name: "redis", status: "starting", meta: "7.4 · port 6379" },
      { name: "mailpit", status: "starting", meta: "SMTP 1025 · UI 8025" },
    ],
  },
  {
    id: "brine-blog",
    name: "brine-blog",
    status: "stopped",
    stack: "wordpress",
    stackLabel: "WordPress 6.8",
    runtime: { label: "PHP", value: "8.2" },
    database: "MariaDB 11.4",
    domain: "brine-blog.test",
    path: "\\\\wsl$\\Ubuntu-22.04\\home\\dev\\sites\\brine-blog",
    location: { kind: "wsl", distro: "Ubuntu-22.04" },
    services: [
      { name: "nginx", status: "stopped", meta: "1.27" },
      { name: "php-fpm", status: "stopped", meta: "8.2.28" },
      { name: "mariadb", status: "stopped", meta: "11.4" },
      { name: "mailpit", status: "stopped", meta: "SMTP 1025 · UI 8025" },
    ],
  },
  {
    id: "moorings",
    name: "moorings",
    status: "stopped",
    stack: "laravel",
    stackLabel: "Laravel 11",
    runtime: { label: "PHP", value: "8.3" },
    database: "MariaDB 10.11",
    domain: "moorings.test",
    path: "C:\\Users\\dev\\sites\\moorings",
    location: { kind: "ntfs" },
    services: [
      { name: "nginx", status: "stopped", meta: "1.27" },
      { name: "php-fpm", status: "stopped", meta: "8.3.14" },
      { name: "mariadb", status: "stopped", meta: "10.11" },
      { name: "redis", status: "stopped", meta: "7.4" },
    ],
  },
];
