import { DockerStatusCard } from "../components/DockerStatusCard";

/** Main screen: system status now, project list later. */
export function Dashboard() {
  return (
    <main className="dashboard">
      <header className="dashboard__header">
        <h1>Dockberth</h1>
        <p>Local dev environments — Docker under the hood, GUI on top.</p>
      </header>
      <DockerStatusCard />
    </main>
  );
}
