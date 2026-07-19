import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const TELEMETRY_DOC_URL =
  "https://github.com/xakmen/dockberth/blob/main/docs/TELEMETRY.md";

/** One-time first-launch consent. Dismissing = "No thanks" (opt-in only). */
export function TelemetryDialog({
  open,
  onChoice,
}: {
  open: boolean;
  onChoice: (enabled: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onChoice(false)}>
      <DialogContent className="border-border-strong/50 bg-card sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            Help improve Dockberth
          </DialogTitle>
          <DialogDescription className="text-[12.5px] leading-relaxed text-muted-foreground">
            Send anonymous crash reports? No project names, paths or personal
            data ever leave your machine — user folders are scrubbed and
            projects are anonymized.{" "}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                void openUrl(TELEMETRY_DOC_URL);
              }}
              className="text-primary hover:underline"
            >
              Exactly what is sent
            </a>
            . You can change this anytime in Settings.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onChoice(false)}
            className="h-[34px] rounded-md border-input bg-transparent text-[12.5px] font-medium text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground dark:bg-transparent dark:hover:bg-transparent"
          >
            No thanks
          </Button>
          <Button
            onClick={() => onChoice(true)}
            className="h-[34px] rounded-md px-5 text-[12.5px] font-semibold hover:bg-primary-hover"
          >
            Enable
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
