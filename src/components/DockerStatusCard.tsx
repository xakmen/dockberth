import { useDockerStatus } from "../hooks/useDockerStatus";

/** Status card showing whether the local Docker daemon is reachable. */
export function DockerStatusCard() {
  const { status, loading, refresh } = useDockerStatus();

  const state = loading ? "checking" : status?.running ? "running" : "down";
  const label = loading
    ? "Checking…"
    : status?.running
      ? `Docker: running${status.version ? ` (v${status.version})` : ""}`
      : "Docker: not found";

  return (
    <div className="status-card">
      <span className={`status-dot status-dot--${state}`} aria-hidden="true" />
      <div className="status-card__body">
        <p className="status-card__label">{label}</p>
        {!loading && status?.error ? (
          <p className="status-card__detail">{status.error}</p>
        ) : null}
      </div>
      <button type="button" onClick={refresh} disabled={loading}>
        Refresh
      </button>
    </div>
  );
}
