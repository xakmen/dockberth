import { useEffect, useRef } from "react";
import {
  Bug,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { DockerStatusRow, ProxyStatusRow } from "@/components/DockerStatusRow";
import { StatusDot } from "@/components/StatusDot";
import type { DockerStatus } from "@/lib/docker";
import {
  PRESET_CHIP,
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
  onRepairHosts: () => void;
  onCheckUpdates: () => void;
  onOpenSettings: () => void;
  onReportBug: () => void;
  docker: DockerStatus | null;
  dockerLoading: boolean;
  dockerStarting: boolean;
  onStartDocker: () => void;
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
  onRepairHosts,
  onCheckUpdates,
  onOpenSettings,
  onReportBug,
  docker,
  dockerLoading,
  dockerStarting,
  onStartDocker,
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
          {/* Berth + container glyph, same paths as design/icon/icon.svg */}
          <svg viewBox="0 0 48 48" className="size-4 text-primary" aria-hidden="true">
            <path
              d="M13 12v13a11 11 0 0 0 22 0V12"
              fill="none"
              stroke="currentColor"
              strokeWidth="4.5"
              strokeLinecap="round"
            />
            <rect x="18.5" y="19" width="11" height="11" rx="2.5" fill="currentColor" />
          </svg>
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
                {(project.config?.preset && PRESET_CHIP[project.config.preset]) || "?"}
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
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={onNewProject}
            className="h-auto flex-1 gap-[7px] rounded-md border-input bg-transparent py-[9px] text-[12.5px] font-medium text-soft shadow-none hover:border-primary hover:bg-transparent hover:text-foreground dark:bg-transparent dark:hover:bg-transparent"
          >
            <Plus className="size-3.5" />
            New project
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label="Maintenance"
                className="size-[36px] shrink-0 rounded-md border-input bg-transparent text-muted-foreground shadow-none hover:border-border-strong hover:bg-transparent hover:text-foreground dark:bg-transparent dark:hover:bg-transparent"
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-56">
              <DropdownMenuItem onSelect={onRepairHosts}>
                <Wrench className="size-3.5" />
                Repair hosts entries
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onCheckUpdates}>
                <RefreshCw className="size-3.5" />
                Check for updates
                <span className="ml-auto font-mono text-[10px] text-faint">
                  v{appVersion}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onReportBug}>
                <Bug className="size-3.5" />
                Report a bug
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onOpenSettings}>
                <Settings className="size-3.5" />
                Settings
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex flex-col gap-1">
          <DockerStatusRow
            status={docker}
            loading={dockerLoading}
            starting={dockerStarting}
            onStartDocker={onStartDocker}
          />
          {docker?.running ? (
            <ProxyStatusRow proxy={proxy} onRetry={onProxyRetry} />
          ) : null}
        </div>
      </div>
    </aside>
  );
}
