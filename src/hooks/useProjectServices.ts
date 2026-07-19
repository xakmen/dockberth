import { useEffect, useState } from "react";
import {
  plannedServices,
  projectServices,
  type ProjectInfo,
  type ServiceState,
} from "@/lib/projects";

const POLL_INTERVAL_MS = 3000;

/** Live per-service container states for the selected project, polled every
 * 3s while the app is focused. Falls back to the config-derived service list
 * when no containers exist yet. */
export function useProjectServices(project: ProjectInfo): ServiceState[] {
  const [services, setServices] = useState<ServiceState[]>([]);

  useEffect(() => {
    let cancelled = false;
    setServices([]);

    const poll = async () => {
      try {
        const live = await projectServices(project.name);
        if (!cancelled) setServices(live);
      } catch {
        // Docker down — keep last known state.
      }
    };

    void poll();
    const interval = setInterval(() => {
      if (document.hasFocus()) void poll();
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [project.name]);

  if (services.length === 0 && project.config) {
    return plannedServices(project.config);
  }
  return services;
}
