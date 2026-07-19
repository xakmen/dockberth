import { cn } from "@/lib/utils";
import type { ProjectStatus } from "@/lib/projects";

const DOT_COLOR: Record<ProjectStatus, string> = {
  running: "bg-status-running",
  starting: "bg-status-starting",
  stopped: "bg-status-stopped",
  error: "bg-status-error",
};

interface StatusDotProps {
  status: ProjectStatus;
  /** Diameter in px (mockup uses 6, 7 and 8). */
  size?: 6 | 7 | 8;
  /** Green glow used on the selected running project (mockup). */
  glow?: boolean;
  className?: string;
}

export function StatusDot({
  status,
  size = 8,
  glow = false,
  className,
}: StatusDotProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "shrink-0 rounded-full",
        size === 6 && "size-1.5",
        size === 7 && "size-[7px]",
        size === 8 && "size-2",
        glow && status === "running" ? "dot-running" : DOT_COLOR[status],
        className,
      )}
    />
  );
}
