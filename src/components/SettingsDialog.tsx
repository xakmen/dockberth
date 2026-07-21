import { useEffect, useMemo, useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  domainSuffixNote,
  isValidDomainSuffix,
  type Settings,
} from "@/lib/projects";
import { version as appVersion } from "../../package.json";

const FIELD_INPUT =
  "h-[35px] rounded-md border-input bg-input-background text-[13px] shadow-none dark:bg-input-background";

type SuffixChoice = "test" | "localhost" | "custom";

function choiceFor(suffix: string): SuffixChoice {
  return suffix === "test" || suffix === "localhost" ? suffix : "custom";
}

export function SettingsDialog({
  open,
  onOpenChange,
  settings,
  onApplyDomainSuffix,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: Settings;
  onApplyDomainSuffix: (suffix: string) => Promise<void>;
}) {
  const [choice, setChoice] = useState<SuffixChoice>(
    choiceFor(settings.domainSuffix),
  );
  const [custom, setCustom] = useState(
    choiceFor(settings.domainSuffix) === "custom" ? settings.domainSuffix : "",
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applying, setApplying] = useState(false);

  // Re-seed the field from the saved value each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    const saved = choiceFor(settings.domainSuffix);
    setChoice(saved);
    setCustom(saved === "custom" ? settings.domainSuffix : "");
  }, [open, settings.domainSuffix]);

  const suffix = choice === "custom" ? custom.trim() : choice;
  const valid = isValidDomainSuffix(suffix);
  const changed = suffix !== settings.domainSuffix;
  const note = useMemo(
    () => (valid ? domainSuffixNote(suffix) : null),
    [valid, suffix],
  );

  const applySuffix = async () => {
    setApplying(true);
    try {
      await onApplyDomainSuffix(suffix);
      setConfirmOpen(false);
    } catch {
      // The error is surfaced by the caller (toast); keep the confirm
      // dialog open so the user can retry instead of failing silently.
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border-strong/50 bg-card sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Settings</DialogTitle>
          <DialogDescription className="text-[12.5px] text-muted-foreground">
            Dockberth v{appVersion}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2.5 rounded-md border border-input px-3.5 py-3">
            <div className="flex flex-col gap-1">
              <Label className="text-[12.5px] font-medium text-foreground">
                Domain suffix
              </Label>
              <span className="text-[11.5px] leading-relaxed text-muted-foreground">
                Projects are served as{" "}
                <span className="font-mono">
                  myproject.{valid ? suffix : settings.domainSuffix}
                </span>
                . Changing it re-renders every project and rewrites the hosts
                file.
              </span>
            </div>
            <div className="flex gap-2">
              <Select
                value={choice}
                onValueChange={(v) => setChoice(v as SuffixChoice)}
                disabled={applying}
              >
                <SelectTrigger className={`${FIELD_INPUT} w-full`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="test">test (recommended)</SelectItem>
                  <SelectItem value="localhost">localhost</SelectItem>
                  <SelectItem value="custom">Custom…</SelectItem>
                </SelectContent>
              </Select>
              {choice === "custom" ? (
                <Input
                  value={custom}
                  disabled={applying}
                  onChange={(e) => setCustom(e.target.value)}
                  placeholder="dev.mycompany"
                  className={`${FIELD_INPUT} font-mono text-[12.5px]`}
                />
              ) : null}
            </div>
            {!valid && choice === "custom" && custom.trim() !== "" ? (
              <span className="text-[11.5px] leading-relaxed text-destructive">
                Invalid suffix: use lowercase letters, digits and hyphens;
                dots may separate labels (e.g. dev.mycompany).
              </span>
            ) : null}
            {note ? (
              <span
                className={`flex items-start gap-1.5 text-[11.5px] leading-relaxed ${
                  note.level === "warning"
                    ? "text-warning-text"
                    : "text-muted-foreground"
                }`}
              >
                {note.level === "warning" ? (
                  <TriangleAlert className="mt-0.5 size-3 shrink-0" />
                ) : null}
                {note.message}
              </span>
            ) : null}
            {changed ? (
              <div>
                <Button
                  disabled={!valid || applying}
                  onClick={() => setConfirmOpen(true)}
                  className="h-[30px] rounded-md text-[12px] font-medium shadow-none"
                >
                  Apply
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-[34px] rounded-md border-input bg-transparent text-[12.5px] font-medium text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground dark:bg-transparent dark:hover:bg-transparent"
          >
            Close
          </Button>
        </DialogFooter>

        {/* Confirmation for the suffix migration — it touches every project. */}
        <Dialog
          open={confirmOpen}
          onOpenChange={(o) => {
            if (!applying) setConfirmOpen(o);
          }}
        >
          <DialogContent className="border-border-strong/50 bg-card sm:max-w-[420px]">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold">
                Change domain suffix to .{suffix}?
              </DialogTitle>
              <DialogDescription className="text-[12.5px] text-muted-foreground">
                This will:
              </DialogDescription>
            </DialogHeader>
            <ul className="list-disc pl-5 text-[12.5px] leading-relaxed text-muted-foreground">
              <li>re-render the compose file of every project</li>
              <li>
                rewrite the hosts file entries (one administrator prompt)
              </li>
              <li>restart currently running projects</li>
            </ul>
            <DialogFooter>
              <Button
                variant="outline"
                disabled={applying}
                onClick={() => setConfirmOpen(false)}
                className="h-[34px] rounded-md border-input bg-transparent text-[12.5px] font-medium text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground dark:bg-transparent dark:hover:bg-transparent"
              >
                Cancel
              </Button>
              <Button
                disabled={applying}
                onClick={() => void applySuffix()}
                className="h-[34px] gap-1.5 rounded-md text-[12.5px] font-medium shadow-none"
              >
                {applying ? <Loader2 className="size-3.5 animate-spin" /> : null}
                {applying ? "Applying…" : "Apply"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
