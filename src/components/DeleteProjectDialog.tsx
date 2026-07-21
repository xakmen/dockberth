import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  deleteProject,
  projectDomain,
  type ProjectInfo,
} from "@/lib/projects";

interface DeleteProjectDialogProps {
  project: ProjectInfo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after successful deletion with a toast message. */
  onDeleted: (message: string) => void;
}

function OptionRow({
  checked,
  onChange,
  label,
  hint,
  destructive = false,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
  destructive?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-input px-3 py-2.5 has-[[data-state=checked]]:border-accent-border has-[[data-state=checked]]:bg-accent/20">
      <Checkbox
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
        className="mt-px"
      />
      <span className="flex flex-col gap-0.5">
        <span
          className={
            destructive
              ? "text-[12.5px] font-medium text-status-error"
              : "text-[12.5px] text-secondary-foreground"
          }
        >
          {label}
        </span>
        {hint ? <span className="text-[11px] text-faint">{hint}</span> : null}
      </span>
    </label>
  );
}

export function DeleteProjectDialog({
  project,
  open,
  onOpenChange,
  onDeleted,
}: DeleteProjectDialogProps) {
  const [removeContainers, setRemoveContainers] = useState(true);
  const [removeHosts, setRemoveHosts] = useState(true);
  const [removeVolumes, setRemoveVolumes] = useState(false);
  const [removeDockberthDir, setRemoveDockberthDir] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setRemoveContainers(true);
      setRemoveHosts(true);
      setRemoveVolumes(false);
      setRemoveDockberthDir(false);
      setDeleting(false);
      setError(null);
    }
    onOpenChange(next);
  };

  const confirm = async () => {
    setDeleting(true);
    setError(null);
    try {
      const result = await deleteProject(project.name, {
        removeContainers,
        removeHosts,
        removeVolumes,
        removeDockberthDir,
      });
      handleOpenChange(false);
      onDeleted(
        result.hostsRemoved
          ? `Project ${project.name} removed`
          : `Project ${project.name} removed — hosts entry kept (elevation declined)`,
      );
    } catch (err: unknown) {
      setError(String(err));
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="border-border-strong/50 bg-card sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            Remove {project.name}
          </DialogTitle>
          <DialogDescription className="text-[12.5px] leading-relaxed text-muted-foreground">
            Your project code is never touched. Choose what Dockberth should
            clean up:
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <OptionRow
            checked={removeContainers}
            onChange={setRemoveContainers}
            label="Stop and remove containers"
            hint="docker compose down"
          />
          <OptionRow
            checked={removeHosts}
            onChange={setRemoveHosts}
            label={`Remove hosts entry (${projectDomain(project.name)})`}
            hint="One UAC prompt"
          />
          <OptionRow
            checked={removeVolumes}
            onChange={setRemoveVolumes}
            label="Delete named volumes — DB data!"
            hint="docker compose down -v · irreversible"
            destructive
          />
          {!removeVolumes ? (
            <span className="px-1 text-[11px] leading-relaxed text-faint">
              The database volume{" "}
              <span className="font-mono">dockberth-{project.name}-db</span> is
              kept — a future project named{" "}
              <span className="font-mono">{project.name}</span> reattaches it,
              with the old data and credentials.
            </span>
          ) : null}
          <OptionRow
            checked={removeDockberthDir}
            onChange={setRemoveDockberthDir}
            label="Delete .dockberth/ folder"
            hint="Keeping it allows re-registering with the same settings"
          />
        </div>

        {error ? (
          <div className="flex items-start gap-2.5 rounded-md border border-status-error/35 bg-status-error/10 px-3.5 py-2.5 text-xs leading-relaxed break-words text-status-error">
            <TriangleAlert className="mt-px size-3.5 shrink-0" />
            <span>{error} — the project is still registered.</span>
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            className="h-[34px] rounded-md border-input bg-transparent text-[12.5px] font-medium text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground dark:bg-transparent dark:hover:bg-transparent"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={deleting}
            onClick={() => void confirm()}
            className="h-[34px] rounded-md px-5 text-[12.5px] font-semibold"
          >
            {deleting ? "Removing…" : "Remove project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
