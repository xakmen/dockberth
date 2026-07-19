import { useCallback, useEffect, useRef, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdateStatus =
  | { state: "idle" }
  | { state: "available"; version: string }
  | { state: "downloading"; percent: number | null };

interface UseUpdaterResult {
  status: UpdateStatus;
  checking: boolean;
  /** Returns whether an update was found. Errors are silent (log only). */
  checkNow: () => Promise<boolean>;
  /** Download + install + relaunch. Only ever called from a user click. */
  install: () => Promise<void>;
}

/** Silent update check on startup + manual re-check. Never auto-restarts:
 * installing is always behind the banner's button. All errors fail
 * silently to the console — never a modal. */
export function useUpdater(): UseUpdaterResult {
  const updateRef = useRef<Update | null>(null);
  const [status, setStatus] = useState<UpdateStatus>({ state: "idle" });
  const [checking, setChecking] = useState(false);

  const checkNow = useCallback(async (): Promise<boolean> => {
    setChecking(true);
    try {
      const update = await check();
      if (update) {
        updateRef.current = update;
        setStatus({ state: "available", version: update.version });
        return true;
      }
      return false;
    } catch (err: unknown) {
      console.error("update check failed:", err);
      return false;
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void checkNow();
  }, [checkNow]);

  const install = useCallback(async () => {
    const update = updateRef.current;
    if (!update) return;
    let total = 0;
    let received = 0;
    setStatus({ state: "downloading", percent: null });
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          received += event.data.chunkLength;
          setStatus({
            state: "downloading",
            percent: total > 0 ? Math.round((received / total) * 100) : null,
          });
        }
      });
      // NSIS passive install exits the app; relaunch brings it back.
      await relaunch();
    } catch (err: unknown) {
      console.error("update install failed:", err);
      setStatus({ state: "available", version: update.version });
    }
  }, []);

  return { status, checking, checkNow, install };
}
