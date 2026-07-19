import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { NewProjectDialog } from "@/components/NewProjectDialog";
import { ProjectView, type ProjectAction } from "@/components/ProjectView";
import { Sidebar } from "@/components/Sidebar";
import { useDockerStatus } from "@/hooks/useDockerStatus";
import { projectStatusOf, useProjects } from "@/hooks/useProjects";
import {
  hostsEnsure,
  projectDomain,
  proxyEnsure,
  restartProject,
  startProject,
  stopProject,
  type ProxyStatus,
} from "@/lib/projects";

function App() {
  const docker = useDockerStatus();
  const { projects, statuses, refresh, pollNow } = useProjects();

  const [proxy, setProxy] = useState<ProxyStatus | null>(null);
  const proxyRequested = useRef(false);
  const [selectedName, setSelectedName] = useState("");
  const [search, setSearch] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<ProjectAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [fixingHosts, setFixingHosts] = useState(false);

  const runProxyEnsure = async () => {
    setProxy(null);
    setProxy(await proxyEnsure());
  };

  // Bring up the shared Traefik proxy once Docker is confirmed running.
  useEffect(() => {
    if (docker.status?.running && !proxyRequested.current) {
      proxyRequested.current = true;
      void runProxyEnsure();
    }
  }, [docker.status?.running]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(query));
  }, [projects, search]);

  const selected =
    projects.find((p) => p.name === selectedName) ?? projects[0] ?? null;

  const handleAction = async (action: ProjectAction) => {
    if (!selected) return;
    setPendingAction(action);
    setActionError(null);
    try {
      const run =
        action === "start"
          ? startProject
          : action === "stop"
            ? stopProject
            : restartProject;
      await run(selected.name);
      await pollNow();
    } catch (err: unknown) {
      setActionError(String(err));
    } finally {
      setPendingAction(null);
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
        statuses={statuses}
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
          status={projectStatusOf(statuses, selected.name)}
          pendingAction={pendingAction}
          onAction={(action) => void handleAction(action)}
          actionError={actionError}
          onDismissError={() => setActionError(null)}
          onFixHosts={() => void handleFixHosts()}
          fixingHosts={fixingHosts}
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
    </div>
  );
}

export default App;
