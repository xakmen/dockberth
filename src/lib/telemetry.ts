import * as Sentry from "@sentry/react";
import { version } from "../../package.json";

/** Frontend crash reporting — strictly OPT-IN (docs/TELEMETRY.md).
 * DSN comes from build-time env VITE_SENTRY_DSN; absent/empty = the SDK
 * is fully disabled, so forks and dev builds send nothing. */

let projectNames: string[] = [];

/** Registered project names get mapped to project-1..n in every event. */
export function setTelemetryProjectNames(names: string[]): void {
  projectNames = [...names].sort();
}

export function scrubString(input: string): string {
  let out = input
    .replace(/C:\\Users\\[^\\/\s]+/gi, "C:\\Users\\<user>")
    .replace(/C:\/Users\/[^\\/\s]+/gi, "C:/Users/<user>")
    .replace(/\/home\/[^\\/\s]+/g, "/home/<user>");
  projectNames.forEach((name, index) => {
    if (name) out = out.split(name).join(`project-${index + 1}`);
  });
  return out;
}

function scrubDeep(value: unknown): unknown {
  if (typeof value === "string") return scrubString(value);
  if (Array.isArray(value)) return value.map(scrubDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = scrubDeep(entry);
    }
    return out;
  }
  return value;
}

let active = false;

/** Idempotent enable/disable. Only initializes Sentry when the user
 * opted in AND a DSN was baked into the build. */
export function initTelemetry(enabled: boolean): void {
  const dsn = (import.meta.env.VITE_SENTRY_DSN as string | undefined) ?? "";
  if (!enabled || dsn === "") {
    if (active) {
      void Sentry.close();
      active = false;
    }
    return;
  }
  if (active) return;
  Sentry.init({
    dsn,
    release: `dockberth@${version}`,
    environment: import.meta.env.DEV ? "dev" : "prod",
    sendDefaultPii: false,
    maxBreadcrumbs: 0,
    beforeBreadcrumb: () => null, // breadcrumbs embed shell commands/paths
    beforeSend: (event) => scrubDeep(event) as Sentry.ErrorEvent,
  });
  active = true;
}
