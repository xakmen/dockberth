import { useCallback, useEffect, useState } from "react";
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
  loading: boolean;
  /** Reload the registry (after create / hosts fix). */
  refresh: () => Promise<void>;
  /** Re-poll container statuses immediately (after start/stop). */
  pollNow: () => Promise<void>;
}

/** Registry list + container statuses polled every 3s while app is focused. */
export function useProjects(): UseProjectsResult {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [statuses, setStatuses] = useState<Record<string, ProjectStatus>>({});
  const [loading, setLoading] = useState(true);

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
    try {
      setStatuses(await projectsStatus());
    } catch {
      // Docker down — keep the last known statuses.
    }
  }, []);

  useEffect(() => {
    void refresh();
    void pollNow();
    const interval = setInterval(() => {
      if (document.hasFocus()) void pollNow();
    }, POLL_INTERVAL_MS);
    const onFocus = () => void pollNow();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh, pollNow]);

  return { projects, statuses, loading, refresh, pollNow };
}

/** Status for one project, defaulting to stopped when unknown. */
export function projectStatusOf(
  statuses: Record<string, ProjectStatus>,
  name: string,
): ProjectStatus {
  return statuses[name] ?? "stopped";
}
