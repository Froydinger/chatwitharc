import { AnimatePresence, motion } from "framer-motion";
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
  if (!run) return null;

  const completed = run.tasks.filter((task) => task.status === "complete").length;
  const total = run.tasks.length;
  const statusText = run.phase === "planning"
    ? "Arc is splitting the request…"
    : run.phase === "synthesizing"
      ? "Arc is pulling the strongest pieces together…"
      : run.phase === "complete"
        ? "Arc finished the parallel pass."
        : run.phase === "failed"
          ? run.error || "Parallel help stopped."
          : `${completed} of ${total || "the"} helpers finished`;

  return (
    <motion.section
      data-testid="subagent-progress"
      aria-live="polite"
      aria-busy={run.phase === "planning" || run.phase === "working" || run.phase === "synthesizing"}
      initial={{ opacity: 0, y: 8, height: 0 }}
      animate={{ opacity: 1, y: 0, height: "auto" }}
      exit={{ opacity: 0, y: -6, height: 0 }}
      transition={{ duration: 0.2 }}
      className="mb-3 overflow-hidden rounded-2xl border border-primary/15 bg-primary/[0.045] px-3 py-2.5 text-xs shadow-sm"
    >
      <div className="mb-2 flex items-center justify-between gap-3 text-muted-foreground">
        <div className="flex min-w-0 items-center gap-1.5 font-medium text-foreground/80">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
          <span>Arc coordinating parallel help</span>
        </div>
        {total > 0 && <span className="shrink-0 tabular-nums">{completed}/{total}</span>}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <AnimatePresence initial={false} mode="popLayout">
          {run.tasks.map((task) => (
            <motion.div
              key={task.id}
              layout
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.86 }}
              transition={{ duration: 0.16 }}
              title={task.focus}
              className={cn(
                "flex max-w-full items-center gap-1.5 rounded-full border px-2 py-1 transition-colors",
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
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <p className="mt-2 truncate text-[11px] text-muted-foreground">{statusText}</p>
    </motion.section>
  );
}
