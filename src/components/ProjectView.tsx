import {
  ArrowUpRight,
  FolderOpen,
  MoreHorizontal,
  Pencil,
  Play,
  RotateCw,
  Square,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OverviewTab } from "@/components/OverviewTab";
import { StatusBadge } from "@/components/StatusBadge";
import type { Project } from "@/lib/mock-projects";

interface ProjectViewProps {
  project: Project;
}

const ACTION_BUTTON =
  "h-[34px] gap-[7px] rounded-md text-[12.5px] shadow-none";
const OUTLINE_ACTION =
  "border-input bg-transparent font-medium text-soft hover:border-border-strong hover:bg-transparent hover:text-foreground dark:bg-transparent dark:hover:bg-transparent";

export function ProjectView({ project }: ProjectViewProps) {
  const running = project.status === "running" || project.status === "starting";

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col gap-0">
        <div className="flex flex-col gap-4 px-7 pt-6">
          {/* Project header */}
          <div className="flex items-center gap-3.5">
            <h1 className="text-[22px] leading-none font-semibold tracking-[-0.2px]">
              {project.name}
            </h1>
            <StatusBadge status={project.status} />
            {/* TODO: open https://<domain> via the opener plugin */}
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="flex items-center gap-[5px] font-mono text-[12.5px] text-primary hover:underline"
            >
              {project.domain}
              <ArrowUpRight className="size-2.5" />
            </a>
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              {running ? (
                <>
                  {/* Deviation from mockup: Stop is an outline button */}
                  <Button
                    variant="outline"
                    className={`${ACTION_BUTTON} ${OUTLINE_ACTION} px-3.5 font-medium`}
                  >
                    <Square className="size-3 fill-current" />
                    Stop
                  </Button>
                  <Button
                    variant="outline"
                    disabled={project.status === "starting"}
                    className={`${ACTION_BUTTON} ${OUTLINE_ACTION} px-3.5 font-medium`}
                  >
                    <RotateCw className="size-3.5" />
                    Restart
                  </Button>
                </>
              ) : (
                <Button
                  className={`${ACTION_BUTTON} px-4 font-semibold hover:bg-primary-hover`}
                >
                  <Play className="size-3 fill-current" />
                  Start
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="More actions"
                    className={`size-[34px] rounded-md ${OUTLINE_ACTION} text-muted-foreground`}
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem>
                    <FolderOpen className="size-3.5" />
                    Open folder
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Pencil className="size-3.5" />
                    Edit configuration
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive">
                    <Trash2 className="size-3.5" />
                    Remove project
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Tab bar — underline style from the mockup */}
          <TabsList className="h-auto w-full justify-start gap-6 rounded-none border-b border-sidebar-border bg-transparent p-0">
            {(["overview", "logs", "services"] as const).map((tab) => (
              <TabsTrigger
                key={tab}
                value={tab}
                className="-mb-px flex-none rounded-none border-0 border-b-2 border-transparent bg-transparent px-0.5 pt-0 pb-[11px] text-[13px] font-medium text-muted-foreground capitalize shadow-none hover:text-soft data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent"
              >
                {tab}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="overview" className="min-h-0 flex-1">
          <OverviewTab project={project} />
        </TabsContent>
        <TabsContent value="logs" className="min-h-0 flex-1">
          <div className="flex h-full items-center justify-center text-xs text-faint">
            Logs — coming soon
          </div>
        </TabsContent>
        <TabsContent value="services" className="min-h-0 flex-1">
          <div className="flex h-full items-center justify-center text-xs text-faint">
            Services — coming soon
          </div>
        </TabsContent>
      </Tabs>
    </main>
  );
}
