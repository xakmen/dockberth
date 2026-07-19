import { useCallback, useEffect, useState } from "react";
import { getDockerStatus, type DockerStatus } from "../lib/docker";

interface UseDockerStatusResult {
  status: DockerStatus | null;
  loading: boolean;
  refresh: () => void;
}

/** Probes Docker on mount and exposes a manual refresh. */
export function useDockerStatus(): UseDockerStatusResult {
  const [status, setStatus] = useState<DockerStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    getDockerStatus()
      .then(setStatus)
      .catch((err: unknown) =>
        setStatus({ running: false, version: null, error: String(err) }),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(refresh, [refresh]);

  return { status, loading, refresh };
}
