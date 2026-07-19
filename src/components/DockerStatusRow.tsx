import { useDockerStatus } from "@/hooks/useDockerStatus";

/** Compact engine-status row at the bottom of the sidebar. */
export function DockerStatusRow() {
  const { status, loading } = useDockerStatus();

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-1 py-0.5 text-[11px] text-muted-foreground">
        <span className="size-1.5 shrink-0 rounded-full bg-status-starting" />
        Checking Docker…
      </div>
    );
  }

  if (status?.running) {
    return (
      <div className="flex items-center gap-2 px-1 py-0.5 text-[11px] text-muted-foreground">
        <span className="size-1.5 shrink-0 rounded-full bg-status-running" />
        Docker running
        <span className="flex-1" />
        {status.version ? (
          <span className="font-mono text-[10px] text-faint">
            v{status.version.split(".").slice(0, 2).join(".")}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-1 py-0.5 text-[11px] text-status-error">
      <span className="size-1.5 shrink-0 rounded-full bg-status-error" />
      Docker not found
      <span className="flex-1" />
      {/* TODO: open the Docker Desktop install page via the opener plugin */}
      <a
        href="#"
        onClick={(e) => e.preventDefault()}
        className="text-[10.5px] text-primary hover:underline"
      >
        Install
      </a>
    </div>
  );
}
