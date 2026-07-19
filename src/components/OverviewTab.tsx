import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusDot } from "@/components/StatusDot";
import type { Project } from "@/lib/mock-projects";

const CARD =
  "gap-3 rounded-lg border-border bg-card px-5 py-[18px] shadow-none";

export function OverviewTab({ project }: { project: Project }) {
  const runningCount = project.services.filter(
    (s) => s.status === "running",
  ).length;

  return (
    <div className="grid h-full min-h-0 grid-cols-2 grid-rows-[auto_1fr] gap-4 overflow-y-auto px-7 pt-5 pb-7">
      {/* Stack */}
      <Card className={CARD}>
        <div className="section-label">Stack</div>
        <div className="flex flex-col gap-2.5 text-[13px]">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Type</span>
            <span className="font-medium">{project.stackLabel}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{project.runtime.label}</span>
            <span className="font-mono text-[12.5px]">
              {project.runtime.value}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Database</span>
            <span className="font-mono text-[12.5px]">{project.database}</span>
          </div>
        </div>
      </Card>

      {/* Path */}
      <Card className={CARD}>
        <div className="section-label">Path</div>
        <div className="font-mono text-xs leading-relaxed break-all text-soft">
          {project.path}
        </div>
        <div className="flex items-center gap-2">
          {project.location.kind === "wsl" ? (
            <span className="rounded-sm border border-accent-border bg-accent px-[7px] py-[3px] font-mono text-[10px] text-accent-foreground">
              WSL · {project.location.distro}
            </span>
          ) : (
            <span className="rounded-sm border border-border-subtle bg-secondary px-[7px] py-[3px] font-mono text-[10px] text-muted-foreground">
              LOCAL · NTFS
            </span>
          )}
          {/* TODO: reveal the project folder via the opener plugin */}
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-primary"
          >
            Open folder
            <ArrowUpRight className="size-2.5" />
          </a>
        </div>
      </Card>

      {/* Services */}
      <Card className={`${CARD} col-span-2 min-h-0 gap-1.5`}>
        <div className="section-label pb-2">
          Services · {runningCount > 0 ? `${runningCount} running` : project.services.length}
        </div>
        <div className="flex flex-col">
          {project.services.map((service, index) => (
            <div
              key={service.name}
              className={
                index < project.services.length - 1
                  ? "flex items-center gap-3 border-b border-secondary px-1 py-[9px]"
                  : "flex items-center gap-3 px-1 py-[9px]"
              }
            >
              <StatusDot status={service.status} size={7} />
              <span className="w-[110px] font-mono text-[12.5px]">
                {service.name}
              </span>
              <span className="flex-1 text-[11.5px] text-faint">
                {service.meta}
              </span>
              <Button
                variant="outline"
                disabled={service.status !== "running"}
                className="h-auto rounded-[6px] border-input bg-transparent px-3 py-1 text-[11.5px] font-normal text-muted-foreground shadow-none hover:border-border-strong hover:bg-transparent hover:text-foreground dark:bg-transparent dark:hover:bg-transparent"
              >
                Shell
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
