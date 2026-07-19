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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { Settings } from "@/lib/projects";
import { version as appVersion } from "../../package.json";

const TELEMETRY_DOC_URL =
  "https://github.com/xakmen/dockberth/blob/main/docs/TELEMETRY.md";

export function SettingsDialog({
  open,
  onOpenChange,
  settings,
  onToggleTelemetry,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: Settings;
  onToggleTelemetry: (enabled: boolean) => void;
}) {
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
          <div className="flex items-start justify-between gap-4 rounded-md border border-input px-3.5 py-3">
            <div className="flex flex-col gap-1">
              <Label className="text-[12.5px] font-medium text-foreground">
                Anonymous crash reports
              </Label>
              <span className="text-[11.5px] leading-relaxed text-muted-foreground">
                Paths and project names are scrubbed before sending.{" "}
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    void openUrl(TELEMETRY_DOC_URL);
                  }}
                  className="text-primary hover:underline"
                >
                  What is sent
                </a>
                . Crash reporting for the Rust side applies after a restart.
              </span>
            </div>
            <Switch
              checked={settings.telemetryEnabled}
              onCheckedChange={onToggleTelemetry}
            />
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
      </DialogContent>
    </Dialog>
  );
}
