import { useCallback, useEffect, useRef, useState } from "react";
import {
  getDockerStatus,
  startDockerDesktop,
  type DockerStatus,
} from "../lib/docker";

const START_POLL_MS = 3_000;
const START_TIMEOUT_MS = 90_000;

interface UseDockerStatusResult {
  status: DockerStatus | null;
  loading: boolean;
  /** True between "Start" being clicked and the daemon reporting ready. */
  starting: boolean;
  refresh: () => void;
  /** Launch Docker Desktop and poll until the daemon is up (or 90s pass). */
  startDocker: () => void;
}

/** Probes Docker on mount and exposes a manual refresh. */
export function useDockerStatus(): UseDockerStatusResult {
  const [status, setStatus] = useState<DockerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const pollTimer = useRef<number | undefined>(undefined);

  const refresh = useCallback(() => {
    setLoading(true);
    getDockerStatus()
      .then(setStatus)
      .catch((err: unknown) =>
        setStatus({
          running: false,
          installed: false,
          version: null,
          error: String(err),
        }),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(refresh, [refresh]);
  useEffect(() => () => window.clearTimeout(pollTimer.current), []);

  const startDocker = useCallback(() => {
    setStarting(true);
    const startedAt = Date.now();

    const timedOut = () => Date.now() - startedAt > START_TIMEOUT_MS;
    const poll = () => {
      pollTimer.current = window.setTimeout(() => {
        getDockerStatus()
          .then((next) => {
            if (next.running || timedOut()) {
              setStatus(next);
              setStarting(false);
            } else {
              poll();
            }
          })
          // A rejecting probe must still honor the timeout, or "Starting…"
          // spins forever when the CLI stays wedged.
          .catch(() => {
            if (timedOut()) setStarting(false);
            else poll();
          });
      }, START_POLL_MS);
    };

    startDockerDesktop()
      .then(poll)
      .catch((err: unknown) => {
        console.error("docker start failed:", err);
        setStarting(false);
        setStatus((prev) =>
          prev ? { ...prev, error: String(err) } : prev,
        );
      });
  }, []);

  return { status, loading, starting, refresh, startDocker };
}
