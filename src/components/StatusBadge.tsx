import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/StatusDot";
import { cn } from "@/lib/utils";
import type { ProjectStatus } from "@/lib/projects";

const BADGE_STYLE: Record<ProjectStatus, string> = {
  running:
    "border-status-running/35 bg-status-running/10 text-status-running-text",
  starting:
    "border-status-starting/35 bg-status-starting/10 text-status-starting",
  stopping:
    "border-status-starting/35 bg-status-starting/10 text-status-starting",
  partial: "border-status-partial/40 bg-status-partial/10 text-status-partial",
  stopped: "border-input bg-secondary/60 text-secondary-foreground",
  error: "border-status-error/35 bg-status-error/10 text-status-error",
};

const BADGE_LABEL: Record<ProjectStatus, string> = {
  running: "Running",
  starting: "Starting…",
  stopping: "Stopping…",
  partial: "Partial",
  stopped: "Stopped",
  error: "Error",
};

export function StatusBadge({
  status,
  title,
}: {
  status: ProjectStatus;
  /** Optional tooltip (partial: lists which services are down). */
  title?: string;
}) {
  return (
    <Badge
      variant="outline"
      title={title}
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
