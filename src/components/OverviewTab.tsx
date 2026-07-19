import { Card } from "@/components/ui/card";
import { StatusDot } from "@/components/StatusDot";
import {
  DB_LABEL,
  type ProjectInfo,
  type ServiceState,
} from "@/lib/projects";

const CARD = "gap-3 rounded-lg border-border bg-card px-5 py-[18px] shadow-none";

export function OverviewTab({
  project,
  services,
}: {
  project: ProjectInfo;
  services: ServiceState[];
}) {
  const runningCount = services.filter((s) => s.state === "running").length;
  const config = project.config;

  return (
    <div className="grid h-full min-h-0 grid-cols-2 grid-rows-[auto_1fr] gap-4 overflow-y-auto px-7 pt-5 pb-7">
      {/* Stack */}
      <Card className={CARD}>
        <div className="section-label">Stack</div>
        {config ? (
          <div className="flex flex-col gap-2.5 text-[13px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Type</span>
              <span className="font-medium capitalize">{config.stack}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">PHP</span>
              <span className="font-mono text-[12.5px]">{config.phpVersion}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Database</span>
              <span className="font-mono text-[12.5px]">
                {DB_LABEL[config.db]}
              </span>
            </div>
            {config.redis ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cache</span>
                <span className="font-mono text-[12.5px]">Redis 7</span>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="text-xs text-status-error">
            .dockberth/config.json is missing — recreate the project.
          </div>
        )}
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
        </div>
      </Card>

      {/* Services */}
      <Card className={`${CARD} col-span-2 min-h-0 gap-1.5`}>
        <div className="section-label pb-2">
          Services ·{" "}
          {runningCount > 0 ? `${runningCount} running` : services.length}
        </div>
        <div className="flex flex-col">
          {services.map((service, index) => (
            <div
              key={service.name}
              className={
                index < services.length - 1
                  ? "flex items-center gap-3 border-b border-secondary px-1 py-[9px]"
                  : "flex items-center gap-3 px-1 py-[9px]"
              }
            >
              <StatusDot status={service.state} size={7} />
              <span className="w-[110px] font-mono text-[12.5px]">
                {service.name}
              </span>
              <span className="flex-1 truncate font-mono text-[11.5px] text-faint">
                {service.image}
              </span>
            </div>
          ))}
          {services.length === 0 ? (
            <div className="px-1 py-2 text-xs text-faint">No services</div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
