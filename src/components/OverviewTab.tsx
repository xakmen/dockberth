import { Card } from "@/components/ui/card";
import { StatusDot } from "@/components/StatusDot";
import {
  DB_LABEL,
  PRESET_LABEL,
  dbConnection,
  type ProjectInfo,
  type ServiceState,
} from "@/lib/projects";

const CARD = "gap-3 rounded-lg border-border bg-card px-5 py-[18px] shadow-none";

function Row({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "truncate font-mono text-[12.5px]" : "truncate font-medium"}>
        {value}
      </span>
    </div>
  );
}

export function OverviewTab({
  project,
  services,
}: {
  project: ProjectInfo;
  services: ServiceState[];
}) {
  const runningCount = services.filter((s) => s.state === "running").length;
  const config = project.config;
  const db = config ? dbConnection(config) : null;

  return (
    <div className="grid h-full min-h-0 grid-cols-2 grid-rows-[auto_auto_1fr] gap-4 overflow-y-auto px-7 pt-5 pb-7">
      {/* Stack */}
      <Card className={CARD}>
        <div className="section-label">Stack</div>
        {config ? (
          <div className="flex flex-col gap-2.5 text-[13px]">
            <Row
              label="Type"
              value={PRESET_LABEL[config.preset ?? ""] ?? config.preset ?? "Unknown"}
              mono={false}
            />
            {config.base === "node" ? (
              <>
                <Row label="Node" value={config.nodeVersion ?? "22"} />
                {config.startCommand ? (
                  <Row label="Start" value={config.startCommand} />
                ) : null}
                <Row label="App port" value={String(config.appPort ?? 3000)} />
              </>
            ) : (
              <Row label="PHP" value={config.phpVersion ?? "8.3"} />
            )}
            {config.db ? <Row label="Database" value={DB_LABEL[config.db]} /> : null}
            {config.redis ? <Row label="Cache" value="Redis 7" /> : null}
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
            <>
              <span className="rounded-sm border border-border-subtle bg-secondary px-[7px] py-[3px] font-mono text-[10px] text-muted-foreground">
                LOCAL · NTFS
              </span>
              <span
                className="text-[10.5px] text-warning-text/80"
                title="NTFS bind mounts are root-owned in containers, so the app container runs as root. Move the project into WSL2 for an unprivileged container and faster files."
              >
                runs as root
              </span>
            </>
          )}
        </div>
      </Card>

      {/* Database connection — for wiring existing code (wp-config.php,
          .env) to the generated environment. */}
      {db ? (
        <Card className={`${CARD} col-span-2`}>
          <div className="section-label">Database connection</div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2.5 text-[13px]">
            <Row label="Host (from containers)" value={db.host} />
            <Row label="Port" value={String(db.port)} />
            <Row label="Database" value={db.database} />
            <Row label="User" value={db.user} />
            <Row label="Password" value={db.password} />
            <Row label="Root password (MySQL/MariaDB)" value="root" />
          </div>
          <div className="text-[11.5px] leading-relaxed text-faint">
            Use these in wp-config.php / .env — Dockberth never edits your
            code. The host is the compose service name, reachable from the
            app container.
          </div>
        </Card>
      ) : null}

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
