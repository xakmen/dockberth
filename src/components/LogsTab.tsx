import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Channel } from "@tauri-apps/api/core";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  logsStart,
  logsStop,
  type LogEvent,
  type ProjectInfo,
  type ProjectStatus,
  type ServiceState,
} from "@/lib/projects";
import { cn } from "@/lib/utils";

const BUFFER_LIMIT = 5000;
const RENDER_LIMIT = 2000;
const FLUSH_INTERVAL_MS = 200;

interface LogLine {
  id: number;
  service: string | null;
  time: string | null;
  message: string;
  stderr: boolean;
}

const SERVICE_COLORS = [
  "text-primary",
  "text-log-purple",
  "text-log-green",
  "text-status-starting",
  "text-status-running-text",
];

function serviceColor(service: string): string {
  let hash = 0;
  for (const ch of service) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return SERVICE_COLORS[Math.abs(hash) % SERVICE_COLORS.length];
}

/** Parse a `docker compose logs --timestamps` line:
 * "app-1  | 2026-07-19T12:00:00.000000000Z message". */
function parseLine(id: number, raw: string, stderr: boolean): LogLine {
  const pipe = raw.indexOf("|");
  if (pipe > 0 && pipe < 40) {
    const service = raw.slice(0, pipe).trim().replace(/-\d+$/, "");
    const rest = raw.slice(pipe + 1).trimStart();
    const match = rest.match(/^(\d{4}-\d{2}-\d{2}T(\d{2}:\d{2}:\d{2})\.(\d{3})\d*Z)\s?/);
    if (match) {
      return {
        id,
        service,
        time: `${match[2]}.${match[3]}`,
        message: rest.slice(match[1].length + 1),
        stderr,
      };
    }
    return { id, service, time: null, message: rest, stderr };
  }
  return { id, service: null, time: null, message: raw, stderr };
}

function Highlighted({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <span className="rounded-xs bg-primary/30 text-foreground">
        {text.slice(index, index + query.length)}
      </span>
      {text.slice(index + query.length)}
    </>
  );
}

export function LogsTab({
  project,
  status,
  services,
}: {
  project: ProjectInfo;
  status: ProjectStatus;
  services: ServiceState[];
}) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [follow, setFollow] = useState(true);
  const [query, setQuery] = useState("");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [streaming, setStreaming] = useState(false);
  const buffer = useRef<LogLine[]>([]);
  const nextId = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(follow);
  followRef.current = follow;

  const serviceNames = useMemo(
    () => [...new Set(services.map((s) => s.name))],
    [services],
  );
  const active = status === "running" || status === "starting";

  // One streaming session per (project, service filter); the follower is
  // killed on unmount / filter change / project stop.
  useEffect(() => {
    if (!active) {
      setStreaming(false);
      return;
    }
    buffer.current = [];
    setLines([]);
    const channel = new Channel<LogEvent>();
    channel.onmessage = (event) => {
      if (event.type === "line") {
        buffer.current.push(parseLine(nextId.current++, event.line, event.stderr));
        if (buffer.current.length > BUFFER_LIMIT) {
          buffer.current.splice(0, buffer.current.length - BUFFER_LIMIT);
        }
      } else {
        setStreaming(false);
      }
    };
    setStreaming(true);
    void logsStart(
      project.name,
      serviceFilter === "all" ? [] : [serviceFilter],
      channel,
    ).catch(() => setStreaming(false));

    const flush = setInterval(() => {
      setLines((prev) =>
        prev.length === buffer.current.length ? prev : [...buffer.current],
      );
    }, FLUSH_INTERVAL_MS);

    return () => {
      clearInterval(flush);
      setStreaming(false);
      void logsStop(project.name);
    };
  }, [project.name, serviceFilter, active]);

  // Follow tail: keep pinned to the bottom while enabled.
  useEffect(() => {
    if (followRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (!atBottom && followRef.current) setFollow(false);
  }, []);

  const resume = () => {
    setFollow(true);
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  const filtered = useMemo(() => {
    if (!query.trim()) return lines;
    const q = query.trim().toLowerCase();
    return lines.filter((l) => l.message.toLowerCase().includes(q));
  }, [lines, query]);
  const visible = filtered.slice(-RENDER_LIMIT);

  const statusLabel = !active
    ? "project stopped"
    : streaming
      ? "streaming"
      : "stream ended";
  const filterLabel =
    serviceFilter === "all" ? "all services" : serviceFilter;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toolbar (screen 2) */}
      <div className="flex shrink-0 items-center gap-2.5 px-7 py-3.5">
        <Select value={serviceFilter} onValueChange={setServiceFilter}>
          <SelectTrigger className="h-[33px] w-[150px] rounded-md border-input bg-transparent text-[12.5px] text-soft shadow-none dark:bg-transparent">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All services</SelectItem>
            {serviceNames.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative w-full max-w-[280px]">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-[13px] -translate-y-1/2 text-faint" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter logs…"
            className="h-[33px] rounded-md border-border-subtle bg-input-background pl-8 text-[12.5px] shadow-none placeholder:text-faint dark:bg-input-background"
          />
        </div>
        <div className="flex-1" />
        {!follow ? (
          <button
            type="button"
            onClick={resume}
            className="rounded-full border border-accent-border bg-accent px-3 py-1 text-[11px] font-medium text-accent-foreground hover:bg-accent/70"
          >
            Resume
          </button>
        ) : null}
        <Label className="flex cursor-pointer items-center gap-2 text-xs text-soft">
          <Switch checked={follow} onCheckedChange={setFollow} />
          Follow tail
        </Label>
        <Button
          variant="outline"
          onClick={() => {
            buffer.current = [];
            setLines([]);
          }}
          className="h-[33px] rounded-md border-input bg-transparent px-3.5 text-xs font-normal text-muted-foreground shadow-none hover:border-border-strong hover:bg-transparent hover:text-foreground dark:bg-transparent dark:hover:bg-transparent"
        >
          Clear
        </Button>
      </div>

      {/* Log viewer */}
      <div className="mx-7 mb-6 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-sidebar-border bg-log-background">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5 font-mono text-[11.5px] leading-[1.85] break-all whitespace-pre-wrap text-secondary-foreground"
        >
          {visible.map((line) => (
            <div key={line.id} className={cn(line.stderr && "text-status-error/80")}>
              {line.time ? <span className="text-dim">{line.time} </span> : null}
              {line.service ? (
                <span className={cn(serviceColor(line.service), "font-medium")}>
                  {line.service.padEnd(9)}
                </span>
              ) : null}{" "}
              <Highlighted text={line.message} query={query.trim()} />
            </div>
          ))}
          {visible.length === 0 ? (
            <div className="text-dim">
              {active ? "No log lines yet…" : "Start the project to see logs."}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2 border-t border-secondary px-4 py-2 font-mono text-[10.5px] text-faint">
          <span
            className={cn(
              "size-1.5 rounded-full",
              streaming ? "bg-status-running" : "bg-status-stopped",
            )}
          />
          {statusLabel} · {filtered.length} lines
          {filtered.length > RENDER_LIMIT
            ? ` (showing last ${RENDER_LIMIT})`
            : ""}{" "}
          · {filterLabel}
        </div>
      </div>
    </div>
  );
}
