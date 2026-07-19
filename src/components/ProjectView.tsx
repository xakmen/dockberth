import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ArrowUpRight,
  Code,
  FolderOpen,
  MoreHorizontal,
  Play,
  RotateCw,
  Square,
  TriangleAlert,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OverviewTab } from "@/components/OverviewTab";
import { StatusBadge } from "@/components/StatusBadge";
import { useProjectServices } from "@/hooks/useProjectServices";
import {
  openProjectEditor,
  openProjectFolder,
  projectDomain,
  type ProjectInfo,
  type ProjectStatus,
} from "@/lib/projects";

export type ProjectAction = "start" | "stop" | "restart";

interface ProjectViewProps {
  project: ProjectInfo;
  status: ProjectStatus;
  pendingAction: ProjectAction | null;
  onAction: (action: ProjectAction) => void;
  actionError: string | null;
  onDismissError: () => void;
  onFixHosts: () => void;
  fixingHosts: boolean;
}

const ACTION_BUTTON = "h-[34px] gap-[7px] rounded-md text-[12.5px] shadow-none";
const OUTLINE_ACTION =
  "border-input bg-transparent font-medium text-soft hover:border-border-strong hover:bg-transparent hover:text-foreground dark:bg-transparent dark:hover:bg-transparent";

export function ProjectView({
  project,
  status,
  pendingAction,
  onAction,
  actionError,
  onDismissError,
  onFixHosts,
  fixingHosts,
}: ProjectViewProps) {
  const services = useProjectServices(project);
  const domain = projectDomain(project.name);
  const active = status === "running" || status === "starting";
  const busy = pendingAction !== null;
  const [hostsBannerDismissed, setHostsBannerDismissed] = useState(false);

  useEffect(() => setHostsBannerDismissed(false), [project.name]);

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <Tabs
        defaultValue="overview"
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="flex flex-col gap-4 px-7 pt-6">
          {/* Project header */}
          <div className="flex items-center gap-3.5">
            <h1 className="text-[22px] leading-none font-semibold tracking-[-0.2px]">
              {project.name}
            </h1>
            <StatusBadge status={status} />
            {/* Display shows the bare domain; the target appends the
                preset's openPath (e.g. Vendure → /dashboard). */}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                void openUrl(`http://${domain}${project.openUrlPath}`);
              }}
              className="flex items-center gap-[5px] font-mono text-[12.5px] text-primary hover:underline"
            >
              {domain}
              <ArrowUpRight className="size-2.5" />
            </a>
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              {active ? (
                <>
                  {/* Deviation from mockup: Stop is an outline button */}
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => onAction("stop")}
                    className={`${ACTION_BUTTON} ${OUTLINE_ACTION} px-3.5`}
                  >
                    <Square className="size-3 fill-current" />
                    {pendingAction === "stop" ? "Stopping…" : "Stop"}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy || status === "starting"}
                    onClick={() => onAction("restart")}
                    className={`${ACTION_BUTTON} ${OUTLINE_ACTION} px-3.5`}
                  >
                    <RotateCw className="size-3.5" />
                    {pendingAction === "restart" ? "Restarting…" : "Restart"}
                  </Button>
                </>
              ) : (
                <Button
                  disabled={busy}
                  onClick={() => onAction("start")}
                  className={`${ACTION_BUTTON} px-4 font-semibold hover:bg-primary-hover`}
                >
                  <Play className="size-3 fill-current" />
                  {pendingAction === "start" ? "Starting…" : "Start"}
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="More actions"
                    className={`size-[34px] rounded-md ${OUTLINE_ACTION} text-muted-foreground`}
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem
                    onSelect={() =>
                      void openUrl(`http://${domain}${project.openUrlPath}`)
                    }
                  >
                    <ArrowUpRight className="size-3.5" />
                    Open in browser
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => void openProjectFolder(project.name)}
                  >
                    <FolderOpen className="size-3.5" />
                    Open folder
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => void openProjectEditor(project.name)}
                  >
                    <Code className="size-3.5" />
                    Open in VS Code
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {!project.hostsOk && !hostsBannerDismissed ? (
            <div className="flex items-center gap-2.5 rounded-md border border-status-starting/30 bg-status-starting/[0.07] px-3.5 py-2.5 text-xs leading-relaxed text-warning-text">
              <TriangleAlert className="size-3.5 shrink-0" />
              <span className="flex-1">
                Hosts entry missing — <span className="font-mono">{domain}</span>{" "}
                won't resolve. Fix it (one UAC prompt) or add{" "}
                <span className="font-mono">127.0.0.1 {domain}</span> to the
                hosts file manually.
              </span>
              <Button
                variant="outline"
                disabled={fixingHosts}
                onClick={onFixHosts}
                className="h-auto rounded-md border-status-starting/40 bg-transparent px-3 py-1 text-[11.5px] font-medium text-warning-text shadow-none hover:bg-status-starting/10 hover:text-warning-text dark:bg-transparent dark:hover:bg-status-starting/10"
              >
                {fixingHosts ? "Fixing…" : "Fix hosts"}
              </Button>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => setHostsBannerDismissed(true)}
                className="text-warning-text/70 hover:text-warning-text"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ) : null}

          {actionError ? (
            <div className="flex items-start gap-2.5 rounded-md border border-status-error/35 bg-status-error/10 px-3.5 py-2.5 text-xs leading-relaxed break-words text-status-error">
              <TriangleAlert className="mt-px size-3.5 shrink-0" />
              <span className="flex-1">{actionError}</span>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={onDismissError}
                className="text-status-error/70 hover:text-status-error"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ) : null}

          {/* Tab bar — underline style from the mockup */}
          <TabsList className="h-auto w-full justify-start gap-6 rounded-none border-b border-sidebar-border bg-transparent p-0">
            {(["overview", "logs", "services"] as const).map((tab) => (
              <TabsTrigger
                key={tab}
                value={tab}
                className="-mb-px flex-none rounded-none border-0 border-b-2 border-transparent bg-transparent px-0.5 pt-0 pb-[11px] text-[13px] font-medium text-muted-foreground capitalize shadow-none hover:text-soft data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent"
              >
                {tab}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="overview" className="min-h-0 flex-1">
          <OverviewTab project={project} services={services} />
        </TabsContent>
        <TabsContent value="logs" className="min-h-0 flex-1">
          <div className="flex h-full items-center justify-center text-xs text-faint">
            Logs — coming soon
          </div>
        </TabsContent>
        <TabsContent value="services" className="min-h-0 flex-1">
          <div className="flex h-full items-center justify-center text-xs text-faint">
            Services — coming soon
          </div>
        </TabsContent>
      </Tabs>
    </main>
  );
}
