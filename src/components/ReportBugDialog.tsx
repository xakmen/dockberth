import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { diagnosticsCollect, type Diagnostics } from "@/lib/projects";

function diagnosticsBlock(d: Diagnostics): string {
  return [
    `Dockberth: ${d.appVersion} (Tauri ${d.tauriVersion})`,
    `Windows: ${d.windowsVersion}`,
    `Docker: ${d.docker}`,
    `WSL distros: ${d.wslDistros.length > 0 ? d.wslDistros.join(", ") : "none"}`,
    `Projects: ${d.projectCount} (presets: ${d.presets.join(", ") || "none"})`,
  ].join("\n");
}

/** Nothing is sent anywhere by the app — the user reads the exact block,
 * then it goes into a GitHub issue they submit themselves. */
export function ReportBugDialog({
  open,
  onOpenChange,
  notify,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notify: (message: string) => void;
}) {
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDiagnostics(null);
    setError(null);
    diagnosticsCollect()
      .then(setDiagnostics)
      .catch((err: unknown) => setError(String(err)));
  }, [open]);

  const submit = async () => {
    if (!diagnostics) return;
    const block = diagnosticsBlock(diagnostics);
    try {
      await navigator.clipboard.writeText(block);
      notify("Diagnostics copied to clipboard");
    } catch {
      // clipboard denied — the issue body still carries the block
    }
    const body = `## What happened?\n\n<!-- Describe the bug and how to reproduce it -->\n\n## Diagnostics\n\n\`\`\`\n${block}\n\`\`\`\n`;
    await openUrl(
      `https://github.com/xakmen/dockberth/issues/new?body=${encodeURIComponent(body)}`,
    );
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border-strong/50 bg-card sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            Report a bug
          </DialogTitle>
          <DialogDescription className="text-[12.5px] leading-relaxed text-muted-foreground">
            This opens a prefilled GitHub issue with the diagnostics below —
            versions and counts only, no project names or paths. Review it
            first; nothing is sent silently.
          </DialogDescription>
        </DialogHeader>

        {diagnostics ? (
          <pre className="overflow-x-auto rounded-md border border-border-subtle bg-log-background px-3.5 py-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-soft">
            {diagnosticsBlock(diagnostics)}
          </pre>
        ) : error ? (
          <div className="rounded-md border border-status-error/35 bg-status-error/10 px-3.5 py-2.5 text-xs break-words text-status-error">
            {error}
          </div>
        ) : (
          <div className="flex items-center gap-2 px-1 py-4 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Collecting diagnostics…
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-[34px] rounded-md border-input bg-transparent text-[12.5px] font-medium text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground dark:bg-transparent dark:hover:bg-transparent"
          >
            Cancel
          </Button>
          <Button
            disabled={!diagnostics}
            onClick={() => void submit()}
            className="h-[34px] rounded-md px-5 text-[12.5px] font-semibold hover:bg-primary-hover"
          >
            Copy &amp; open GitHub issue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
