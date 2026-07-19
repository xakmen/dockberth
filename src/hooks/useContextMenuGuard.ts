import { useEffect } from "react";

/** Suppress the WebView's native context menu app-wide, unconditionally —
 * including editable targets, spellcheck, and text selections. The app will
 * provide its own custom context menu on top of this; native copy/paste
 * shortcuts (Ctrl+C/V/X) keep working. Mounted once in App. */
export function useContextMenuGuard() {
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      event.preventDefault();
    };
    // Capture phase so no other listener sees the event first.
    document.addEventListener("contextmenu", handler, { capture: true });
    return () =>
      document.removeEventListener("contextmenu", handler, { capture: true });
  }, []);
}
