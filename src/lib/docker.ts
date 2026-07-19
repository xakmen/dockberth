import { invoke } from "@tauri-apps/api/core";

/** Mirror of the `DockerStatus` struct in src-tauri/src/docker.rs. */
export interface DockerStatus {
  running: boolean;
  version: string | null;
  error: string | null;
}

/** Probe the local Docker installation via `docker version --format json`. */
export function getDockerStatus(): Promise<DockerStatus> {
  return invoke<DockerStatus>("docker_version");
}
