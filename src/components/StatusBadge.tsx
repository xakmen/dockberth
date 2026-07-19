import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/StatusDot";
import { cn } from "@/lib/utils";
import type { ProjectStatus } from "@/lib/mock-projects";

const BADGE_STYLE: Record<ProjectStatus, string> = {
  running:
    "border-status-running/35 bg-status-running/10 text-status-running-text",
  starting:
    "border-status-starting/35 bg-status-starting/10 text-status-starting",
  stopped: "border-input bg-secondary/60 text-secondary-foreground",
  error: "border-status-error/35 bg-status-error/10 text-status-error",
};

const BADGE_LABEL: Record<ProjectStatus, string> = {
  running: "Running",
  starting: "Starting",
  stopped: "Stopped",
  error: "Error",
};

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 rounded-full px-2.5 py-[3px] text-[11.5px] leading-none font-medium",
        BADGE_STYLE[status],
      )}
    >
      <StatusDot status={status} size={6} />
      {BADGE_LABEL[status]}
    </Badge>
  );
}
