import { useState } from "react";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import { FolderOpen, Sparkles, TriangleAlert } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DB_LABEL,
  PHP_VERSIONS,
  createProject,
  detectProject,
  isValidProjectName,
  projectDomain,
  wslCheckDocker,
  wslListDistros,
  type DatabaseKind,
  type DetectResult,
  type ProjectInfo,
} from "@/lib/projects";

type WslCheck =
  | { state: "none" }
  | { state: "checking" }
  | { state: "ok"; distro: string }
  | { state: "error"; message: string };

const FIELD_INPUT =
  "h-[35px] rounded-md border-input bg-input-background text-[13px] shadow-none dark:bg-input-background";

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (project: ProjectInfo) => void;
}

export function NewProjectDialog({
  open,
  onOpenChange,
  onCreated,
}: NewProjectDialogProps) {
  const [path, setPath] = useState("");
  const [detect, setDetect] = useState<DetectResult | null>(null);
  const [name, setName] = useState("");
  const [phpVersion, setPhpVersion] = useState<string>("8.3");
  const [db, setDb] = useState<DatabaseKind>("mariadb-11");
  const [redis, setRedis] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wslCheck, setWslCheck] = useState<WslCheck>({ state: "none" });

  const reset = () => {
    setPath("");
    setDetect(null);
    setName("");
    setPhpVersion("8.3");
    setDb("mariadb-11");
    setRedis(true);
    setCreating(false);
    setError(null);
    setWslCheck({ state: "none" });
  };

  const checkWsl = async (distro: string) => {
    setWslCheck({ state: "checking" });
    try {
      const distros = await wslListDistros();
      const found = distros.find((d) => d.name === distro);
      if (!found) {
        setWslCheck({
          state: "error",
          message: `WSL distro '${distro}' not found`,
        });
        return;
      }
      if (found.version !== 2) {
        setWslCheck({
          state: "error",
          message: `'${distro}' is a WSL1 distro — WSL2 required. Convert it with: wsl --set-version ${distro} 2`,
        });
        return;
      }
      await wslCheckDocker(distro);
      setWslCheck({ state: "ok", distro });
    } catch (err: unknown) {
      setWslCheck({ state: "error", message: String(err) });
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const browse = async () => {
    setError(null);
    const picked = await openFolderDialog({
      directory: true,
      multiple: false,
      title: "Select project folder",
    });
    if (typeof picked !== "string") return;
    setPath(picked);
    setWslCheck({ state: "none" });
    try {
      const result = await detectProject(picked);
      setDetect(result);
      setName(result.suggestedName);
      if (result.location.kind === "wsl") {
        void checkWsl(result.location.distro);
      }
    } catch (err: unknown) {
      setDetect(null);
      setError(String(err));
    }
  };

  const canCreate =
    !creating &&
    path !== "" &&
    detect?.stack === "laravel" &&
    isValidProjectName(name) &&
    (detect.location.kind !== "wsl" || wslCheck.state === "ok");

  const create = async () => {
    if (!canCreate) return;
    setCreating(true);
    setError(null);
    try {
      const project = await createProject({ path, name, phpVersion, db, redis });
      reset();
      onCreated(project);
    } catch (err: unknown) {
      setError(String(err));
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="border-border-strong/50 bg-card sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            New project
          </DialogTitle>
          <DialogDescription className="text-[12.5px] text-muted-foreground">
            Pick an existing project folder — Dockberth generates the Docker
            environment next to it in <span className="font-mono">.dockberth/</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Folder picker */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium text-soft">
              Project folder
            </Label>
            <div className="flex items-center gap-2">
              <div className="min-h-[35px] flex-1 truncate rounded-md border border-input bg-input-background px-3 py-2 font-mono text-xs text-soft">
                {path || <span className="text-faint">No folder selected</span>}
              </div>
              <Button
                variant="outline"
                onClick={() => void browse()}
                className="h-[35px] gap-1.5 rounded-md border-input bg-transparent text-[12.5px] font-medium text-soft shadow-none hover:border-border-strong hover:bg-transparent hover:text-foreground dark:bg-transparent dark:hover:bg-transparent"
              >
                <FolderOpen className="size-3.5" />
                Browse…
              </Button>
            </div>
          </div>

          {/* Detection banner */}
          {detect?.stack === "laravel" ? (
            <div className="flex items-center gap-2.5 rounded-md border border-accent-border bg-accent px-3.5 py-2.5 text-[12.5px] text-accent-foreground">
              <Sparkles className="size-3.5 shrink-0" />
              <span>
                <span className="font-semibold">Laravel detected</span> —
                artisan found
              </span>
            </div>
          ) : null}
          {detect && detect.stack !== "laravel" ? (
            <div className="flex items-center gap-2.5 rounded-md border border-status-error/35 bg-status-error/10 px-3.5 py-2.5 text-[12.5px] text-status-error">
              <TriangleAlert className="size-3.5 shrink-0" />
              Stack not supported yet — only Laravel projects for now
              (WordPress and Vendure are coming next).
            </div>
          ) : null}

          {/* Name + domain preview */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project-name" className="text-xs font-medium text-soft">
              Project name
            </Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-project"
              className={FIELD_INPUT}
            />
            <div className="text-[11.5px] text-muted-foreground">
              {name && !isValidProjectName(name) ? (
                <span className="text-status-error">
                  Use lowercase letters, digits and hyphens
                </span>
              ) : (
                <>
                  Local domain:{" "}
                  <span className="font-mono text-primary">
                    {projectDomain(name || "my-project")}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* PHP + database */}
          <div className="grid grid-cols-2 gap-3.5">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium text-soft">PHP version</Label>
              <Select value={phpVersion} onValueChange={setPhpVersion}>
                <SelectTrigger className={`${FIELD_INPUT} w-full font-mono text-[12.5px]`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PHP_VERSIONS.map((version) => (
                    <SelectItem key={version} value={version}>
                      {version}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium text-soft">Database</Label>
              <Select
                value={db}
                onValueChange={(value) => setDb(value as DatabaseKind)}
              >
                <SelectTrigger className={`${FIELD_INPUT} w-full`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(DB_LABEL) as DatabaseKind[]).map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {DB_LABEL[kind]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Optional services */}
          <div className="flex flex-col gap-2">
            <Label className="text-xs font-medium text-soft">
              Optional services
            </Label>
            <label className="flex w-fit cursor-pointer items-center gap-2.5 rounded-md border border-input px-3 py-2.5 text-[12.5px] text-secondary-foreground has-[[data-state=checked]]:border-accent-border has-[[data-state=checked]]:bg-accent/40 has-[[data-state=checked]]:text-foreground">
              <Checkbox
                checked={redis}
                onCheckedChange={(checked) => setRedis(checked === true)}
              />
              Redis
            </label>
          </div>

          {/* Location hints */}
          {detect && path && detect.location.kind === "ntfs" ? (
            <div className="flex items-start gap-2.5 rounded-md border border-status-starting/30 bg-status-starting/[0.07] px-3.5 py-2.5 text-xs leading-relaxed text-warning-text">
              <TriangleAlert className="mt-px size-3.5 shrink-0" />
              <span>
                Project is on an NTFS drive — it will work, but projects run
                best inside WSL2: native filesystem speed and an unprivileged
                container (on NTFS the container must run as root to write
                files).
              </span>
            </div>
          ) : null}
          {detect?.location.kind === "wsl" && wslCheck.state === "checking" ? (
            <div className="flex items-center gap-2.5 rounded-md border border-border-subtle bg-muted px-3.5 py-2.5 text-xs text-muted-foreground">
              Checking Docker integration for {detect.location.distro}…
            </div>
          ) : null}
          {wslCheck.state === "ok" ? (
            <div className="flex items-start gap-2.5 rounded-md border border-accent-border bg-accent/40 px-3.5 py-2.5 text-xs leading-relaxed text-accent-foreground">
              <Sparkles className="mt-px size-3.5 shrink-0" />
              <span>
                WSL2 · {wslCheck.distro} — native filesystem speed, container
                runs unprivileged.
              </span>
            </div>
          ) : null}
          {wslCheck.state === "error" ? (
            <div className="flex items-start gap-2.5 rounded-md border border-status-error/35 bg-status-error/10 px-3.5 py-2.5 text-xs leading-relaxed break-words text-status-error">
              <TriangleAlert className="mt-px size-3.5 shrink-0" />
              <span>{wslCheck.message}</span>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-md border border-status-error/35 bg-status-error/10 px-3.5 py-2.5 text-xs break-words text-status-error">
              {error}
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            className="h-[34px] rounded-md border-input bg-transparent text-[12.5px] font-medium text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground dark:bg-transparent dark:hover:bg-transparent"
          >
            Cancel
          </Button>
          <Button
            disabled={!canCreate}
            onClick={() => void create()}
            className="h-[34px] rounded-md px-5 text-[12.5px] font-semibold hover:bg-primary-hover"
          >
            {creating ? "Creating…" : "Create project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
