import { useMemo, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ProjectView } from "@/components/ProjectView";
import { MOCK_PROJECTS } from "@/lib/mock-projects";

function App() {
  const [selectedId, setSelectedId] = useState(MOCK_PROJECTS[0]?.id ?? "");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return MOCK_PROJECTS;
    return MOCK_PROJECTS.filter((p) => p.name.toLowerCase().includes(query));
  }, [search]);

  const selected =
    MOCK_PROJECTS.find((p) => p.id === selectedId) ?? MOCK_PROJECTS[0];

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        projects={filtered}
        totalCount={MOCK_PROJECTS.length}
        selectedId={selected?.id ?? ""}
        onSelect={setSelectedId}
        search={search}
        onSearchChange={setSearch}
      />
      {selected ? <ProjectView project={selected} /> : null}
    </div>
  );
}

export default App;
