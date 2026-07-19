import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UpdateStatus } from "@/hooks/useUpdater";

/** Persistent, non-intrusive update pill (bottom-right, above toasts). */
export function UpdateBanner({
  status,
  onInstall,
}: {
  status: UpdateStatus;
  onInstall: () => void;
}) {
  if (status.state === "idle") return null;

  return (
    <div className="fixed right-4 bottom-16 z-50 flex items-center gap-3 rounded-md border border-accent-border bg-accent px-4 py-2.5 text-[12.5px] text-accent-foreground shadow-lg">
      {status.state === "available" ? (
        <>
          <Download className="size-3.5 shrink-0" />
          <span>Dockberth v{status.version} is available</span>
          <Button
            onClick={onInstall}
            className="h-auto rounded-md px-3 py-1 text-[11.5px] font-semibold hover:bg-primary-hover"
          >
            Restart to update
          </Button>
        </>
      ) : (
        <>
          <Loader2 className="size-3.5 shrink-0 animate-spin" />
          <span>
            Downloading update
            {status.percent !== null ? ` — ${status.percent}%` : "…"}
          </span>
        </>
      )}
    </div>
  );
}
