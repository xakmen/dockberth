import { useEffect } from "react";

/** Suppress the WebView's native context menu (Reload/Print/…) app-wide.
 * Exceptions where the native menu stays useful:
 * - editable targets (inputs, textareas, contenteditable) — paste/spellcheck
 * - a non-empty text selection — copying from the logs viewer
 * Mounted once in App. */
export function useContextMenuGuard() {
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const editable = target?.closest(
        "input, textarea, [contenteditable='true'], [contenteditable='']",
      );
      const selection = window.getSelection();
      const hasSelection = selection !== null && !selection.isCollapsed;
      if (!editable && !hasSelection) {
        event.preventDefault();
      }
    };
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, []);
}
