import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { NewProjectDialog } from "@/components/NewProjectDialog";
import { ProjectView, type ProjectAction } from "@/components/ProjectView";
import { Sidebar } from "@/components/Sidebar";
import { useContextMenuGuard } from "@/hooks/useContextMenuGuard";
import { useDockerStatus } from "@/hooks/useDockerStatus";
import { useProjects } from "@/hooks/useProjects";
import {
  hostsEnsure,
  projectDomain,
  proxyEnsure,
  restartProject,
  startProject,
  stopProject,
  type ProjectStatus,
  type ProxyStatus,
} from "@/lib/projects";

const PROXY_HEAL_BACKOFF_MS = 30_000;
const TRANSITION_TIMEOUT_MS = 30_000;

/** A lifecycle command in flight. Polling results for this project are
 * ignored until the command resolves AND a poll confirms the expected
 * terminal state (or the timeout marks the project as error). */
interface Transition {
  action: ProjectAction;
  expected: "running" | "stopped";
  startedAt: number;
  commandDone: boolean;
}

function App() {
  useContextMenuGuard();
  const docker = useDockerStatus();
  const { projects, statuses, proxyRunning, refresh, pollNow } = useProjects();

  const [proxy, setProxy] = useState<ProxyStatus | null>(null);
  const proxyRequested = useRef(false);
  const lastProxyEnsure = useRef(0);
  const [selectedName, setSelectedName] = useState("");
  const [search, setSearch] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [transitions, setTransitions] = useState<Record<string, Transition>>({});
  /** Projects whose last transition timed out; value = the state that was
   * expected — cleared once a poll finally reports it (or on a new action). */
  const [failed, setFailed] = useState<Record<string, "running" | "stopped">>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [fixingHosts, setFixingHosts] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4000);
  }, []);

  const runProxyEnsure = useCallback(async (): Promise<ProxyStatus> => {
    lastProxyEnsure.current = Date.now();
    setProxy(null);
    const status = await proxyEnsure();
    setProxy(status);
    return status;
  }, []);

  // Bring up the shared Traefik proxy once Docker is confirmed running.
  useEffect(() => {
    if (docker.status?.running && !proxyRequested.current) {
      proxyRequested.current = true;
      void runProxyEnsure();
    }
  }, [docker.status?.running, runProxyEnsure]);

  // Self-heal: the status poll sees the proxy container. If Docker is
  // responsive but the proxy is down, re-run proxy_ensure (30s backoff).
  useEffect(() => {
    if (
      proxyRunning !== false || // null = docker unreachable / no poll yet
      !proxyRequested.current ||
      Date.now() - lastProxyEnsure.current < PROXY_HEAL_BACKOFF_MS
    ) {
      return;
    }
    void runProxyEnsure().then((status) => {
      if (status.running) notify("Proxy restarted");
    });
  }, [proxyRunning, runProxyEnsure, notify]);

  // Resolve transitions against fresh poll data: confirm the expected
  // terminal state, or time out into "error" with a toast.
  useEffect(() => {
    const now = Date.now();
    setTransitions((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [name, t] of Object.entries(prev)) {
        const polled: ProjectStatus = statuses[name] ?? "stopped";
        if (t.commandDone && polled === t.expected) {
          delete next[name];
          changed = true;
          setFailed((f) => {
            if (!(name in f)) return f;
            const rest = { ...f };
            delete rest[name];
            return rest;
          });
        } else if (now - t.startedAt > TRANSITION_TIMEOUT_MS) {
          delete next[name];
          changed = true;
          setFailed((f) => ({ ...f, [name]: t.expected }));
          notify(`${name}: did not reach "${t.expected}" within 30s`);
        }
      }
      return changed ? next : prev;
    });
  }, [statuses, notify]);

  // Clear a stale error once polling finally reports the expected state.
  useEffect(() => {
    setFailed((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const [name, expected] of Object.entries(prev)) {
        if ((statuses[name] ?? "stopped") === expected) {
          delete next[name];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [statuses]);

  // THE status map — badge, sidebar dot and action buttons all read this.
  const displayStatuses = useMemo(() => {
    const out: Record<string, ProjectStatus> = {};
    for (const project of projects) {
      const t = transitions[project.name];
      if (t) {
        out[project.name] = t.action === "stop" ? "stopping" : "starting";
      } else if (project.name in failed) {
        out[project.name] = "error";
      } else {
        out[project.name] = statuses[project.name] ?? "stopped";
      }
    }
    return out;
  }, [projects, statuses, transitions, failed]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(query));
  }, [projects, search]);

  const selected =
    projects.find((p) => p.name === selectedName) ?? projects[0] ?? null;

  const handleAction = async (action: ProjectAction) => {
    if (!selected) return;
    const name = selected.name;
    const expected = action === "stop" ? "stopped" : "running";
    setActionError(null);
    setFailed((f) => {
      const rest = { ...f };
      delete rest[name];
      return rest;
    });
    setTransitions((t) => ({
      ...t,
      [name]: { action, expected, startedAt: Date.now(), commandDone: false },
    }));
    try {
      const run =
        action === "start"
          ? startProject
          : action === "stop"
            ? stopProject
            : restartProject;
      await run(name);
      setTransitions((t) =>
        t[name] ? { ...t, [name]: { ...t[name], commandDone: true } } : t,
      );
      await pollNow();
    } catch (err: unknown) {
      setActionError(String(err));
      setTransitions((t) => {
        const rest = { ...t };
        delete rest[name];
        return rest;
      });
    }
  };

  const handleFixHosts = async () => {
    if (!selected) return;
    setFixingHosts(true);
    try {
      await hostsEnsure(projectDomain(selected.name));
      await refresh();
    } catch (err: unknown) {
      setActionError(String(err));
    } finally {
      setFixingHosts(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        projects={filtered}
        totalCount={projects.length}
        statuses={displayStatuses}
        selectedName={selected?.name ?? ""}
        onSelect={(name) => {
          setSelectedName(name);
          setActionError(null);
        }}
        search={search}
        onSearchChange={setSearch}
        onNewProject={() => setWizardOpen(true)}
        docker={docker.status}
        dockerLoading={docker.loading}
        proxy={proxy}
        onProxyRetry={() => void runProxyEnsure()}
      />
      {selected ? (
        <ProjectView
          project={selected}
          status={displayStatuses[selected.name] ?? "stopped"}
          onAction={(action) => void handleAction(action)}
          actionError={actionError}
          onDismissError={() => setActionError(null)}
          onFixHosts={() => void handleFixHosts()}
          fixingHosts={fixingHosts}
          onDeleted={(message) => {
            notify(message);
            setSelectedName("");
            void refresh();
            void pollNow();
          }}
        />
      ) : (
        <EmptyState onNewProject={() => setWizardOpen(true)} />
      )}
      <NewProjectDialog
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onCreated={(project) => {
          setWizardOpen(false);
          setSelectedName(project.name);
          void refresh();
          void pollNow();
        }}
      />
      {toast ? (
        <div className="fixed right-4 bottom-4 z-50 rounded-md border border-accent-border bg-accent px-4 py-2.5 text-[12.5px] text-accent-foreground shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
  );
}

export default App;
