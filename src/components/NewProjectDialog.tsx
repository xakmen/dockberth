import { useEffect, useRef, useState } from "react";
import { Channel } from "@tauri-apps/api/core";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import { FolderOpen, Loader2, Sparkles, TriangleAlert } from "lucide-react";
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
  NODE_VERSIONS,
  PHP_VERSIONS,
  createProject,
  detectProject,
  isValidProjectName,
  joinPath,
  parentPathOf,
  presetList,
  projectDomain,
  scaffoldCancel,
  scaffoldProject,
  wslCheckDocker,
  wslListDistros,
  type DatabaseKind,
  type DetectResult,
  type Preset,
  type ProjectInfo,
  type ProjectLocation,
  type ScaffoldEvent,
} from "@/lib/projects";
import { cn } from "@/lib/utils";

type Mode = "existing" | "new";

type WslCheck =
  | { state: "none" }
  | { state: "checking" }
  | { state: "ok"; distro: string }
  | { state: "error"; message: string };

type DbChoice = DatabaseKind | "none";

type ScaffoldState =
  | { state: "idle" }
  | { state: "running"; pulling: boolean; lines: string[] }
  | { state: "failed"; error: string };

const FIELD_INPUT =
  "h-[35px] rounded-md border-input bg-input-background text-[13px] shadow-none dark:bg-input-background";

const FIELD_LABEL = "text-xs font-medium text-soft";

const OUTLINE_BTN =
  "h-[35px] gap-1.5 rounded-md border-input bg-transparent text-[12.5px] font-medium text-soft shadow-none hover:border-border-strong hover:bg-transparent hover:text-foreground dark:bg-transparent dark:hover:bg-transparent";

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
  const [mode, setMode] = useState<Mode>("existing");
  const [presets, setPresets] = useState<Preset[]>([]);

  // Existing-mode state
  const [path, setPath] = useState("");
  const [detect, setDetect] = useState<DetectResult | null>(null);

  // New-mode state
  const [stackId, setStackId] = useState("wordpress");
  const [parentPath, setParentPath] = useState("");
  const [parentLocation, setParentLocation] = useState<ProjectLocation | null>(null);
  const [scaffold, setScaffold] = useState<ScaffoldState>({ state: "idle" });
  const cancelRequested = useRef(false);

  // Shared fields
  const [name, setName] = useState("");
  const [phpVersion, setPhpVersion] = useState<string>("8.3");
  const [nodeVersion, setNodeVersion] = useState<string>("22");
  const [db, setDb] = useState<DbChoice>("mariadb-11");
  const [redis, setRedis] = useState(false);
  const [startCommand, setStartCommand] = useState("npm run dev");
  const [appPort, setAppPort] = useState("3000");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wslCheck, setWslCheck] = useState<WslCheck>({ state: "none" });
  /** Set once a scaffold has succeeded: if the subsequent createProject
   * fails, the folder is already on disk, so the primary button retries the
   * create (register the scaffolded folder) instead of re-scaffolding — which
   * would fail with "already exists and is not empty". */
  const [pendingCreate, setPendingCreate] = useState<{
    path: string;
    preset: Preset;
  } | null>(null);

  useEffect(() => {
    if (open) void presetList().then(setPresets).catch(() => {});
  }, [open]);

  const preset = detect?.preset ?? null;
  const stackPreset = presets.find((p) => p.id === stackId) ?? null;
  const scaffolding = scaffold.state === "running";
  const busy = creating || scaffolding;

  const reset = () => {
    setMode("existing");
    setPath("");
    setDetect(null);
    setStackId("wordpress");
    setParentPath("");
    setParentLocation(null);
    setScaffold({ state: "idle" });
    cancelRequested.current = false;
    setName("");
    setPhpVersion("8.3");
    setNodeVersion("22");
    setDb("mariadb-11");
    setRedis(false);
    setStartCommand("npm run dev");
    setAppPort("3000");
    setCreating(false);
    setError(null);
    setWslCheck({ state: "none" });
    setPendingCreate(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && scaffolding) return; // don't lose a running scaffold silently
    if (!next) reset();
    onOpenChange(next);
  };

  const checkWsl = async (distro: string) => {
    setWslCheck({ state: "checking" });
    try {
      const distros = await wslListDistros();
      const found = distros.find((d) => d.name === distro);
      if (!found) {
        setWslCheck({ state: "error", message: `WSL distro '${distro}' not found` });
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

  const applyDefaults = (p: Preset | null) => {
    const defaults = p?.defaults;
    setPhpVersion(defaults?.phpVersion ?? "8.3");
    setNodeVersion(defaults?.nodeVersion ?? "22");
    setDb(defaults?.db ?? (p?.base === "php" ? "mariadb-11" : "none"));
    setRedis(defaults?.redis ?? false);
    setStartCommand(defaults?.startCommand ?? "npm run dev");
    setAppPort(String(p?.appPort ?? 3000));
  };

  const browseExisting = async () => {
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
      applyDefaults(result.preset);
      if (result.location.kind === "wsl") void checkWsl(result.location.distro);
    } catch (err: unknown) {
      setDetect(null);
      setError(String(err));
    }
  };

  const browseParent = async () => {
    setError(null);
    const picked = await openFolderDialog({
      directory: true,
      multiple: false,
      title: "Select the folder to create the project in",
    });
    if (typeof picked !== "string") return;
    setParentPath(picked);
    setWslCheck({ state: "none" });
    try {
      const result = await detectProject(picked);
      setParentLocation(result.location);
      if (result.location.kind === "wsl") void checkWsl(result.location.distro);
    } catch (err: unknown) {
      setParentLocation(null);
      setError(String(err));
    }
  };

  /** Empty folder picked in Existing mode → switch to New mode keeping
   * the location: parent = folder's parent, name = folder's name. */
  const switchToScaffoldHere = () => {
    if (!detect) return;
    setMode("new");
    setStackId("wordpress");
    applyDefaults(presets.find((p) => p.id === "wordpress") ?? null);
    setParentPath(parentPathOf(path));
    setParentLocation(detect.location);
    // name already prefilled from the folder; wslCheck already ran
  };

  const activeLocation: ProjectLocation | null =
    mode === "existing" ? (detect?.location ?? null) : parentLocation;
  const activePreset = mode === "existing" ? preset : stackPreset;

  const portValid = /^\d+$/.test(appPort) && +appPort > 0 && +appPort < 65536;
  const locationOk =
    activeLocation !== null &&
    (activeLocation.kind !== "wsl" || wslCheck.state === "ok");

  const canCreateExisting =
    !busy && path !== "" && preset !== null && isValidProjectName(name) &&
    (preset.base !== "php" || db !== "none") &&
    (preset.base !== "node" || (portValid && startCommand.trim() !== "")) &&
    locationOk;

  const canCreateNew =
    !busy && parentPath !== "" && stackPreset?.scaffold != null &&
    isValidProjectName(name) && db !== "none" && locationOk;

  // `chosen` carries the base directly, so we never fall back to "php" when
  // the preset list failed to load. Node fields are only sent in existing
  // mode (where they are shown and validated); new-mode scaffolds use the
  // preset defaults, which avoids serializing a hidden/stale port as NaN.
  const finishCreate = async (
    projectPath: string,
    chosen: Preset,
    nodeOverrides?: { startCommand: string; appPort: number },
  ) => {
    const base = chosen.base;
    const project = await createProject({
      path: projectPath,
      name,
      preset: chosen.id,
      phpVersion: base === "php" ? phpVersion : undefined,
      nodeVersion: base === "node" ? nodeVersion : undefined,
      db: db === "none" ? null : db,
      redis,
      startCommand: base === "node" ? nodeOverrides?.startCommand : undefined,
      appPort: base === "node" ? nodeOverrides?.appPort : undefined,
    });
    setPendingCreate(null);
    reset();
    onCreated(project);
  };

  const createExisting = async () => {
    if (!canCreateExisting || !preset) return;
    setCreating(true);
    setError(null);
    try {
      await finishCreate(path, preset, {
        startCommand: startCommand.trim(),
        appPort: +appPort,
      });
    } catch (err: unknown) {
      setError(String(err));
      setCreating(false);
    }
  };

  // Post-scaffold create retry (see pendingCreate): the folder already
  // exists, so this registers it without downloading the framework again.
  const retryCreate = async () => {
    if (!pendingCreate) return;
    setCreating(true);
    setError(null);
    try {
      await finishCreate(pendingCreate.path, pendingCreate.preset);
    } catch (err: unknown) {
      setError(String(err));
      setCreating(false);
    }
  };

  const createNew = () => {
    if (!canCreateNew || !stackPreset) return;
    setError(null);
    cancelRequested.current = false;
    setScaffold({ state: "running", pulling: false, lines: [] });
    const channel = new Channel<ScaffoldEvent>();
    channel.onmessage = (event) => {
      if (event.type === "line") {
        setScaffold((prev) =>
          prev.state === "running"
            ? {
                state: "running",
                pulling: event.pulling,
                lines: [...prev.lines.slice(-7), event.line],
              }
            : prev,
        );
      } else if (event.type === "done") {
        setScaffold({ state: "idle" });
        setCreating(true);
        const scaffoldedPath = joinPath(parentPath, name);
        // Remember it so a failed create can be retried without re-scaffolding.
        setPendingCreate({ path: scaffoldedPath, preset: stackPreset });
        void finishCreate(scaffoldedPath, stackPreset).catch((err: unknown) => {
          setError(String(err));
          setCreating(false);
        });
      } else {
        setScaffold(
          cancelRequested.current
            ? { state: "idle" }
            : { state: "failed", error: event.error },
        );
      }
    };
    void scaffoldProject(parentPath, name, stackPreset.id, channel).catch(
      (err: unknown) => {
        setScaffold({ state: "idle" });
        setError(String(err));
      },
    );
  };

  const cancelScaffold = () => {
    cancelRequested.current = true;
    void scaffoldCancel(name, parentPath);
  };

  const dbChoices: DbChoice[] =
    activePreset?.base === "node"
      ? ["none", "postgres-16", "mysql-8.4"]
      : ["mariadb-11", "mysql-8.4", "postgres-16"];

  const scaffoldable = ["wordpress", "laravel", "vendure"];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-x-hidden overflow-y-auto border-border-strong/50 bg-card sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">New project</DialogTitle>
          <DialogDescription className="text-[12.5px] text-muted-foreground">
            {mode === "existing"
              ? "Pick an existing project folder — Dockberth generates the Docker environment next to it in "
              : "Scaffold a brand-new project — Dockberth downloads the framework and sets up the environment in "}
            <span className="font-mono">.dockberth/</span>.
          </DialogDescription>
        </DialogHeader>

        {/* Mode switch */}
        <div className="grid grid-cols-2 gap-1 rounded-md border border-border-subtle bg-input-background p-1">
          {(["existing", "new"] as const).map((m) => (
            <button
              key={m}
              type="button"
              disabled={busy}
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={cn(
                "rounded-[5px] px-3 py-1.5 text-[12.5px] font-medium",
                mode === m
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "existing" ? "Existing project" : "New project"}
            </button>
          ))}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {mode === "new" ? (
            <>
              {/* Stack picker */}
              <div className="flex flex-col gap-2">
                <Label className={FIELD_LABEL}>Stack</Label>
                <div className="grid grid-cols-3 gap-2">
                  {scaffoldable.map((id) => {
                    const p = presets.find((x) => x.id === id);
                    const enabled = p?.scaffold != null;
                    const selected = stackId === id && enabled;
                    return (
                      <button
                        key={id}
                        type="button"
                        disabled={!enabled || busy}
                        title={enabled ? undefined : "Coming soon"}
                        onClick={() => {
                          setStackId(id);
                          applyDefaults(p ?? null);
                        }}
                        className={cn(
                          "flex flex-col items-start gap-0.5 rounded-md border px-3 py-2.5 text-left",
                          selected
                            ? "border-accent-border bg-accent/40"
                            : "border-input",
                          enabled
                            ? "hover:border-border-strong"
                            : "opacity-50",
                        )}
                      >
                        <span
                          className={cn(
                            "text-[12.5px] font-medium",
                            selected ? "text-foreground" : "text-secondary-foreground",
                          )}
                        >
                          {p?.displayName ?? id}
                        </span>
                        <span className="text-[10.5px] text-faint">
                          {enabled ? "Fresh install" : "Coming soon"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Parent folder */}
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label className={FIELD_LABEL}>Create in</Label>
                <div className="flex min-w-0 items-center gap-2">
                  <div
                    title={parentPath || undefined}
                    className="min-h-[35px] min-w-0 flex-1 truncate rounded-md border border-input bg-input-background px-3 py-2 font-mono text-xs text-soft"
                  >
                    {parentPath || (
                      <span className="text-faint">No folder selected</span>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void browseParent()}
                    className={OUTLINE_BTN}
                  >
                    <FolderOpen className="size-3.5" />
                    Browse…
                  </Button>
                </div>
                {parentPath && name && isValidProjectName(name) ? (
                  <div
                    title={joinPath(parentPath, name)}
                    className="min-w-0 truncate font-mono text-[11px] text-faint"
                  >
                    → {joinPath(parentPath, name)}
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <>
              {/* Folder picker (existing) */}
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label className={FIELD_LABEL}>Project folder</Label>
                <div className="flex min-w-0 items-center gap-2">
                  <div
                    title={path || undefined}
                    className="min-h-[35px] min-w-0 flex-1 truncate rounded-md border border-input bg-input-background px-3 py-2 font-mono text-xs text-soft"
                  >
                    {path || <span className="text-faint">No folder selected</span>}
                  </div>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void browseExisting()}
                    className={OUTLINE_BTN}
                  >
                    <FolderOpen className="size-3.5" />
                    Browse…
                  </Button>
                </div>
              </div>

              {/* Detection result */}
              {preset ? (
                <div className="flex items-start gap-2.5 rounded-md border border-accent-border bg-accent px-3.5 py-2.5 text-[12.5px] leading-relaxed text-accent-foreground">
                  <Sparkles className="mt-px size-3.5 shrink-0" />
                  <span>
                    <span className="font-semibold">
                      {preset.displayName} detected
                    </span>
                    {preset.notes ? <> — {preset.notes}</> : null}
                  </span>
                </div>
              ) : null}
              {detect && !preset && detect.empty ? (
                <div className="flex items-center gap-2.5 rounded-md border border-border-subtle bg-muted px-3.5 py-2.5 text-[12.5px] text-secondary-foreground">
                  <span className="flex-1">
                    Folder is empty — switch to New project to scaffold one
                    here?
                  </span>
                  <Button
                    variant="outline"
                    onClick={switchToScaffoldHere}
                    className="h-auto shrink-0 rounded-md border-accent-border bg-transparent px-3 py-1 text-[11.5px] font-medium text-accent-foreground shadow-none hover:bg-accent/40 dark:bg-transparent dark:hover:bg-accent/40"
                  >
                    Scaffold here
                  </Button>
                </div>
              ) : null}
              {detect && !preset && !detect.empty ? (
                <div className="flex items-center gap-2.5 rounded-md border border-status-error/35 bg-status-error/10 px-3.5 py-2.5 text-[12.5px] text-status-error">
                  <TriangleAlert className="size-3.5 shrink-0" />
                  Stack not recognized — no framework markers and no
                  package.json found in this folder.
                </div>
              ) : null}
            </>
          )}

          {/* Name + domain preview */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project-name" className={FIELD_LABEL}>
              Project name
            </Label>
            <Input
              id="project-name"
              value={name}
              disabled={busy}
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

          {/* Stack-specific fields */}
          {activePreset?.base === "php" ? (
            <div className="grid grid-cols-2 gap-3.5">
              <div className="flex flex-col gap-1.5">
                <Label className={FIELD_LABEL}>PHP version</Label>
                <Select value={phpVersion} onValueChange={setPhpVersion} disabled={busy}>
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
                <Label className={FIELD_LABEL}>Database</Label>
                <Select
                  value={db}
                  onValueChange={(v) => setDb(v as DbChoice)}
                  disabled={busy}
                >
                  <SelectTrigger className={`${FIELD_INPUT} w-full`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {dbChoices.map((kind) => (
                      <SelectItem key={kind} value={kind}>
                        {kind === "none" ? "None" : DB_LABEL[kind]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}

          {activePreset?.base === "node" && mode === "existing" ? (
            <>
              <div className="grid grid-cols-2 gap-3.5">
                <div className="flex flex-col gap-1.5">
                  <Label className={FIELD_LABEL}>Node version</Label>
                  <Select value={nodeVersion} onValueChange={setNodeVersion} disabled={busy}>
                    <SelectTrigger className={`${FIELD_INPUT} w-full font-mono text-[12.5px]`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {NODE_VERSIONS.map((version) => (
                        <SelectItem key={version} value={version}>
                          {version}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className={FIELD_LABEL}>Database</Label>
                  <Select
                    value={db}
                    onValueChange={(v) => setDb(v as DbChoice)}
                    disabled={busy}
                  >
                    <SelectTrigger className={`${FIELD_INPUT} w-full`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {dbChoices.map((kind) => (
                        <SelectItem key={kind} value={kind}>
                          {kind === "none" ? "None" : DB_LABEL[kind]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-[1fr_120px] gap-3.5">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="start-command" className={FIELD_LABEL}>
                    Start command
                  </Label>
                  <Input
                    id="start-command"
                    value={startCommand}
                    onChange={(e) => setStartCommand(e.target.value)}
                    className={`${FIELD_INPUT} font-mono text-xs`}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="app-port" className={FIELD_LABEL}>
                    App port
                  </Label>
                  <Input
                    id="app-port"
                    value={appPort}
                    onChange={(e) => setAppPort(e.target.value)}
                    className={`${FIELD_INPUT} font-mono text-xs`}
                  />
                </div>
              </div>
            </>
          ) : null}

          {/* Optional services */}
          {activePreset ? (
            <div className="flex flex-col gap-2">
              <Label className={FIELD_LABEL}>Optional services</Label>
              <label className="flex w-fit cursor-pointer items-center gap-2.5 rounded-md border border-input px-3 py-2.5 text-[12.5px] text-secondary-foreground has-[[data-state=checked]]:border-accent-border has-[[data-state=checked]]:bg-accent/40 has-[[data-state=checked]]:text-foreground">
                <Checkbox
                  checked={redis}
                  disabled={busy}
                  onCheckedChange={(checked) => setRedis(checked === true)}
                />
                Redis
              </label>
            </div>
          ) : null}

          {/* Location hints (shared) */}
          {activeLocation?.kind === "ntfs" ? (
            <div className="flex items-start gap-2.5 rounded-md border border-status-starting/30 bg-status-starting/[0.07] px-3.5 py-2.5 text-xs leading-relaxed text-warning-text">
              <TriangleAlert className="mt-px size-3.5 shrink-0" />
              <span>
                {mode === "new" ? "Target" : "Project"} is on an NTFS drive —
                it will work, but projects run best inside WSL2: native
                filesystem speed and an unprivileged container (on NTFS the
                container must run as root to write files).
                {activePreset?.base === "node" ? (
                  <>
                    {" "}
                    node_modules lives in a container volume here — run{" "}
                    <span className="font-mono">npm install</span> inside the
                    container.
                  </>
                ) : null}
              </span>
            </div>
          ) : null}
          {activeLocation?.kind === "wsl" && wslCheck.state === "checking" ? (
            <div className="flex items-center gap-2.5 rounded-md border border-border-subtle bg-muted px-3.5 py-2.5 text-xs text-muted-foreground">
              Checking Docker integration for {activeLocation.distro}…
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

          {/* Scaffold progress */}
          {scaffold.state === "running" ? (
            <div className="flex flex-col gap-2 rounded-md border border-border-subtle bg-log-background px-3.5 py-3">
              <div className="flex items-center gap-2 text-xs text-soft">
                <Loader2 className="size-3.5 animate-spin text-primary" />
                {scaffold.pulling
                  ? `Pulling ${stackPreset?.scaffold?.image ?? "image"} (first time only)…`
                  : `Downloading ${stackPreset?.displayName ?? "framework"}…`}
              </div>
              <div className="max-h-28 overflow-y-auto font-mono text-[10.5px] leading-relaxed text-faint">
                {scaffold.lines.map((line, i) => (
                  <div key={i} className="truncate">
                    {line}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {scaffold.state === "failed" ? (
            <div className="rounded-md border border-status-error/35 bg-status-error/10 px-3.5 py-2.5 font-mono text-[10.5px] leading-relaxed break-words whitespace-pre-wrap text-status-error">
              {scaffold.error}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-md border border-status-error/35 bg-status-error/10 px-3.5 py-2.5 text-xs break-words text-status-error">
              {error}
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2">
          {scaffolding ? (
            <Button
              variant="outline"
              onClick={cancelScaffold}
              className="h-[34px] rounded-md border-status-error/40 bg-transparent text-[12.5px] font-medium text-status-error shadow-none hover:bg-status-error/10 hover:text-status-error dark:bg-transparent dark:hover:bg-status-error/10"
            >
              Cancel download
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              className="h-[34px] rounded-md border-input bg-transparent text-[12.5px] font-medium text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground dark:bg-transparent dark:hover:bg-transparent"
            >
              Cancel
            </Button>
          )}
          <Button
            disabled={
              pendingCreate
                ? busy
                : mode === "existing"
                  ? !canCreateExisting
                  : !canCreateNew
            }
            onClick={() => {
              if (pendingCreate) void retryCreate();
              else if (mode === "existing") void createExisting();
              else createNew();
            }}
            className="h-[34px] rounded-md px-5 text-[12.5px] font-semibold hover:bg-primary-hover"
          >
            {creating
              ? "Creating…"
              : scaffolding
                ? "Scaffolding…"
                : pendingCreate
                  ? "Retry create"
                  : "Create project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
