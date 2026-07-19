import { useEffect, useRef } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DockerStatusRow, ProxyStatusRow } from "@/components/DockerStatusRow";
import { StatusDot } from "@/components/StatusDot";
import type { DockerStatus } from "@/lib/docker";
import {
  STACK_CHIP,
  type ProjectInfo,
  type ProjectStatus,
  type ProxyStatus,
} from "@/lib/projects";
import { cn } from "@/lib/utils";
import { version as appVersion } from "../../package.json";

interface SidebarProps {
  projects: ProjectInfo[];
  totalCount: number;
  statuses: Record<string, ProjectStatus>;
  selectedName: string;
  onSelect: (name: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  onNewProject: () => void;
  docker: DockerStatus | null;
  dockerLoading: boolean;
  proxy: ProxyStatus | null;
  onProxyRetry: () => void;
}

export function Sidebar({
  projects,
  totalCount,
  statuses,
  selectedName,
  onSelect,
  search,
  onSearchChange,
  onNewProject,
  docker,
  dockerLoading,
  proxy,
  onProxyRetry,
}: SidebarProps) {
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <aside className="flex w-[280px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      {/* Logo + app name + version chip */}
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-accent-border bg-accent">
          {/* Boat-hull glyph from the mockup */}
          <div className="h-2 w-3 rounded-b-[4px] border-[1.5px] border-t-0 border-primary" />
        </div>
        <div className="text-[14.5px] font-semibold">Dockberth</div>
        <div className="rounded-sm border border-border-subtle bg-muted px-1.5 py-0.5 font-mono text-[10px] text-faint">
          v{appVersion}
        </div>
      </div>

      {/* Project search */}
      <div className="relative mx-3 mb-3">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-[13px] -translate-y-1/2 text-faint" />
        <Input
          ref={searchRef}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search projects…"
          className="h-[33px] rounded-md border-border-subtle bg-input-background pr-14 pl-8 text-[12.5px] shadow-none placeholder:text-faint dark:bg-input-background"
        />
        <kbd className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 rounded border border-border-subtle px-[5px] py-px font-mono text-[10px] text-faint">
          Ctrl+K
        </kbd>
      </div>

      {totalCount > 0 ? (
        <div className="px-5 pt-0.5 pb-1.5 text-[10.5px] font-semibold tracking-[1.2px] text-faint">
          PROJECTS · {totalCount}
        </div>
      ) : null}

      {/* Project list */}
      <div className="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto px-2">
        {projects.map((project) => {
          const active = project.name === selectedName;
          const status = statuses[project.name] ?? "stopped";
          return (
            <button
              key={project.name}
              type="button"
              onClick={() => onSelect(project.name)}
              className={cn(
                "flex shrink-0 items-center gap-2.5 rounded-md border border-transparent px-3 py-[9px] text-left",
                active ? "sidebar-item-active" : "hover:bg-muted",
              )}
            >
              <StatusDot status={status} glow={active} />
              <span
                className={cn(
                  "flex-1 truncate",
                  active
                    ? "font-medium text-foreground"
                    : "text-secondary-foreground",
                )}
              >
                {project.name}
              </span>
              <span
                className={cn(
                  "rounded px-[5px] py-0.5 font-mono text-[9.5px]",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "bg-secondary text-muted-foreground",
                )}
              >
                {project.config ? STACK_CHIP[project.config.stack] : "?"}
              </span>
            </button>
          );
        })}
        {totalCount === 0 ? (
          <div className="flex flex-1 items-center justify-center text-xs text-[color:var(--border-strong)]">
            No projects
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-xs text-faint">
            No matching projects
          </div>
        ) : null}
      </div>

      {/* New project + engine status */}
      <div className="flex flex-col gap-2.5 p-3">
        <Button
          variant="outline"
          onClick={onNewProject}
          className="h-auto w-full gap-[7px] rounded-md border-input bg-transparent py-[9px] text-[12.5px] font-medium text-soft shadow-none hover:border-primary hover:bg-transparent hover:text-foreground dark:bg-transparent dark:hover:bg-transparent"
        >
          <Plus className="size-3.5" />
          New project
        </Button>
        <div className="flex flex-col gap-1">
          <DockerStatusRow status={docker} loading={dockerLoading} />
          {docker?.running ? (
            <ProxyStatusRow proxy={proxy} onRetry={onProxyRetry} />
          ) : null}
        </div>
      </div>
    </aside>
  );
}
