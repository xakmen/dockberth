import { useCallback, useEffect, useRef, useState } from "react";
import {
  listProjects,
  projectsStatus,
  type ProjectInfo,
  type ProjectStatus,
} from "@/lib/projects";

const POLL_INTERVAL_MS = 3000;

interface UseProjectsResult {
  projects: ProjectInfo[];
  statuses: Record<string, ProjectStatus>;
  /** From the same poll: is the Traefik proxy container running?
   * null until the first successful poll. */
  proxyRunning: boolean | null;
  /** Increments after every poll, so effects that must re-evaluate each
   * poll (e.g. proxy self-heal) can depend on a value that always changes
   * even when proxyRunning stays the same primitive. */
  pollCount: number;
  loading: boolean;
  /** Reload the registry (after create / delete / hosts fix). */
  refresh: () => Promise<void>;
  /** Re-poll container statuses immediately (after start/stop). */
  pollNow: () => Promise<void>;
}

/** Registry list + container statuses polled every 3s while app is focused. */
export function useProjects(): UseProjectsResult {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [statuses, setStatuses] = useState<Record<string, ProjectStatus>>({});
  const [proxyRunning, setProxyRunning] = useState<boolean | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const polling = useRef(false);

  const refresh = useCallback(async () => {
    try {
      setProjects(await listProjects());
    } catch (err: unknown) {
      console.error("project_list failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const pollNow = useCallback(async () => {
    if (polling.current) return;
    polling.current = true;
    try {
      const snapshot = await projectsStatus();
      setStatuses(snapshot.projects);
      setProxyRunning(snapshot.proxyRunning);
    } catch {
      // Docker down — keep the last known statuses, mark proxy unknown.
      setProxyRunning(null);
    } finally {
      setPollCount((n) => n + 1);
      polling.current = false;
    }
  }, []);

  useEffect(() => {
    void refresh();
    void pollNow();
    let tick = 0;
    const interval = setInterval(() => {
      tick += 1;
      // Every 3s while focused; every 30s in the background so proxy
      // self-heal still happens without the window being active.
      if (document.hasFocus() || tick % 10 === 0) void pollNow();
    }, POLL_INTERVAL_MS);
    const onFocus = () => void pollNow();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh, pollNow]);

  return { projects, statuses, proxyRunning, pollCount, loading, refresh, pollNow };
}

/** Status for one project, defaulting to stopped when unknown. */
export function projectStatusOf(
  statuses: Record<string, ProjectStatus>,
  name: string,
): ProjectStatus {
  return statuses[name] ?? "stopped";
}
