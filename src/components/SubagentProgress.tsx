import { ConditionalTransition } from "@/components/transitions/ConditionalTransition";
import { useNativeListLayout } from "@/hooks/useNativeListLayout";
import { Check, Circle, Loader2, Sparkles, X } from "lucide-react";
import { useSubagentStore, type SubagentTaskState } from "@/store/useSubagentStore";
import { cn } from "@/lib/utils";

function taskIcon(task: SubagentTaskState) {
  if (task.status === "complete") return <Check className="h-3 w-3" aria-hidden="true" />;
  if (task.status === "failed") return <X className="h-3 w-3" aria-hidden="true" />;
  if (task.status === "working") return <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />;
  return <Circle className="h-2.5 w-2.5" aria-hidden="true" />;
}

export function SubagentProgress() {
  const run = useSubagentStore((state) => state.run);
  const taskList = useNativeListLayout();

  const completed = run?.tasks.filter((task) => task.status === "complete").length ?? 0;
  const total = run?.tasks.length ?? 0;
  const statusText = run?.phase === "planning"
    ? "Arc is splitting the request…"
    : run?.phase === "synthesizing"
      ? "Arc is pulling the strongest pieces together…"
      : run?.phase === "complete"
        ? "Arc finished the parallel pass."
        : run?.phase === "failed"
          ? run?.error || "Parallel help stopped."
          : `${completed} of ${total || "the"} helpers finished`;

  return (
    <ConditionalTransition preset="panel">{run && <section
      data-testid="subagent-progress"
      aria-live="polite"
      aria-busy={run?.phase === "planning" || run?.phase === "working" || run?.phase === "synthesizing"}
      className="mb-3 overflow-hidden rounded-2xl border border-primary/15 bg-primary/[0.045] px-3 py-2.5 text-xs shadow-sm"
    >
      <div className="mb-2 flex items-center justify-between gap-3 text-muted-foreground">
        <div className="flex min-w-0 items-center gap-1.5 font-medium text-foreground/80">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
          <span>Arc coordinating parallel help</span>
        </div>
        {total > 0 && <span className="shrink-0 tabular-nums">{completed}/{total}</span>}
      </div>

      <div ref={taskList} className="relative flex flex-wrap gap-1.5">
          {run.tasks.map((task) => (
            <div data-layout-row
              key={task.id}
              title={task.focus}
              className={cn(
                "arc-helper-chip flex max-w-full items-center gap-1.5 rounded-full border px-2 py-1 transition-colors",
                task.status === "working" && "border-primary/35 bg-primary/10 text-foreground",
                task.status === "complete" && "border-emerald-500/20 bg-emerald-500/5 text-muted-foreground",
                task.status === "failed" && "border-destructive/25 bg-destructive/5 text-destructive",
                task.status === "queued" && "border-border/60 bg-background/30 text-muted-foreground",
              )}
            >
              <span className={cn(
                "flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                task.status === "working" && "text-primary",
                task.status === "complete" && "text-emerald-500",
                task.status === "failed" && "text-destructive",
              )}>
                {taskIcon(task)}
              </span>
              <span className="truncate">{task.label}</span>
            </div>
          ))}
      </div>

      <p className="mt-2 truncate text-[11px] text-muted-foreground">{statusText}</p>
    </section>}</ConditionalTransition>
  );
}
