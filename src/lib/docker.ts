import { invoke } from "@tauri-apps/api/core";

/** Mirror of the `DockerStatus` struct in src-tauri/src/docker.rs. */
export interface DockerStatus {
  running: boolean;
  installed: boolean;
  version: string | null;
  error: string | null;
}

/** Docker Desktop download page, opened from the "Install" link. */
export const DOCKER_INSTALL_URL =
  "https://www.docker.com/products/docker-desktop/";

/** Probe the local Docker installation via `docker version --format json`. */
export function getDockerStatus(): Promise<DockerStatus> {
  return invoke<DockerStatus>("docker_version");
}

/** Launch Docker Desktop (detached); poll getDockerStatus for readiness. */
export function startDockerDesktop(): Promise<void> {
  return invoke("docker_start");
}
