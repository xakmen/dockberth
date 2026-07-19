import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Screen 4 — shown in the main panel when no projects are registered. */
export function EmptyState({ onNewProject }: { onNewProject: () => void }) {
  return (
    <main className="flex flex-1 items-center justify-center">
      <div className="flex max-w-[380px] flex-col items-center gap-5 pb-10 text-center">
        {/* Dashed boat-hull illustration from the mockup */}
        <div className="relative flex h-24 w-[150px] items-end justify-center">
          <div className="relative h-16 w-[120px] rounded-b-xl border-[1.5px] border-t-0 border-dashed border-[color:var(--border-strong)]">
            <div className="absolute -top-1 -left-[5px] size-2 rounded-full border-[1.5px] border-[color:var(--border-strong)] bg-background" />
            <div className="absolute -top-1 -right-[5px] size-2 rounded-full border-[1.5px] border-[color:var(--border-strong)] bg-background" />
          </div>
          <div className="absolute -bottom-3 flex h-1.5 w-full items-center justify-center gap-1.5">
            <div className="h-[1.5px] w-[26px] rounded bg-accent-border" />
            <div className="h-[1.5px] w-3.5 rounded bg-accent-border/70" />
            <div className="h-[1.5px] w-8 rounded bg-accent-border" />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="text-lg font-semibold">No projects moored yet</div>
          <div className="text-[13px] leading-relaxed text-muted-foreground">
            Create your first project — Dockberth will generate the Docker
            environment for you.
          </div>
        </div>
        <Button
          onClick={onNewProject}
          className="h-auto gap-1.5 rounded-md px-5 py-[9px] text-[13px] font-semibold hover:bg-primary-hover"
        >
          <Plus className="size-3.5" />
          New project
        </Button>
      </div>
    </main>
  );
}
