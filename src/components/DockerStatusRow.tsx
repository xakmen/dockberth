import { openUrl } from "@tauri-apps/plugin-opener";
import { DOCKER_INSTALL_URL, type DockerStatus } from "@/lib/docker";
import type { ProxyStatus } from "@/lib/projects";

/** Compact engine-status rows at the bottom of the sidebar. */
export function DockerStatusRow({
  status,
  loading,
  starting,
  onStartDocker,
}: {
  status: DockerStatus | null;
  loading: boolean;
  starting: boolean;
  onStartDocker: () => void;
}) {
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

  // Docker Desktop was launched; waiting for the daemon to come up.
  if (starting) {
    return (
      <div className="flex items-center gap-2 px-1 py-0.5 text-[11px] text-muted-foreground">
        <span className="size-1.5 shrink-0 rounded-full bg-status-starting" />
        Starting Docker…
      </div>
    );
  }

  // Installed but the daemon is down → offer to start it; otherwise link
  // to the Docker Desktop download page.
  const installed = status?.installed ?? false;
  return (
    <div
      className="flex items-center gap-2 px-1 py-0.5 text-[11px] text-status-error"
      title={status?.error ?? undefined}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-status-error" />
      {installed ? "Docker not running" : "Docker not found"}
      <span className="flex-1" />
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          if (installed) {
            onStartDocker();
          } else {
            void openUrl(DOCKER_INSTALL_URL);
          }
        }}
        className="text-[10.5px] text-primary hover:underline"
      >
        {installed ? "Start" : "Install"}
      </a>
    </div>
  );
}

/** Traefik proxy status row — only rendered while Docker is running. */
export function ProxyStatusRow({
  proxy,
  onRetry,
}: {
  proxy: ProxyStatus | null;
  onRetry: () => void;
}) {
  if (!proxy) {
    return (
      <div className="flex items-center gap-2 px-1 py-0.5 text-[11px] text-muted-foreground">
        <span className="size-1.5 shrink-0 rounded-full bg-status-starting" />
        Starting proxy…
      </div>
    );
  }

  if (proxy.running) {
    return (
      <div className="flex items-center gap-2 px-1 py-0.5 text-[11px] text-muted-foreground">
        <span className="size-1.5 shrink-0 rounded-full bg-status-running" />
        Proxy running
        <span className="flex-1" />
        <span className="font-mono text-[10px] text-faint">:80 :443</span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2 px-1 py-0.5 text-[11px] text-status-error"
      title={proxy.error ?? undefined}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-status-error" />
      Proxy error
      <span className="flex-1" />
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          onRetry();
        }}
        className="text-[10.5px] text-primary hover:underline"
      >
        Retry
      </a>
    </div>
  );
}
