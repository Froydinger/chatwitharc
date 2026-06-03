import { useState } from "react";
import { Calendar, Clock, Mail, Bell, MessageSquare, Trash2, ExternalLink, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { describeCronSchedule } from "@/lib/scheduleLabels";

export interface ScheduledTaskData {
  id: string;
  title: string;
  prompt: string;
  schedule_type: "once" | "cron";
  cron_expr?: string | null;
  next_run_at: string;
  deliver_in_chat: boolean;
  deliver_push: boolean;
  deliver_email: boolean;
}

function formatWhen(iso: string, isCron: boolean, cron?: string | null) {
  if (isCron) return describeCronSchedule(cron, iso);
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.round((d.getTime() - now.getTime()) / 60000);
  if (diffMin < 1) return "In moments";
  if (diffMin < 60) return `In ${diffMin} min`;
  if (d.toDateString() === now.toDateString())
    return `Today ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function ScheduledTaskCard({ task }: { task: ScheduledTaskData }) {
  const [deleted, setDeleted] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();
  const isCron = task.schedule_type === "cron";

  const handleDelete = async () => {
    setDeleting(true);
    const { error } = await supabase.from("scheduled_tasks" as any).delete().eq("id", task.id);
    setDeleting(false);
    if (error) {
      toast.error("Couldn't cancel task");
      return;
    }
    setDeleted(true);
    toast.success("Task cancelled");
  };

  const glass = "rounded-2xl border border-primary/25 bg-background/55 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.3),0_0_18px_hsl(var(--primary)/0.10),inset_0_1px_0_hsl(var(--foreground)/0.06)]";

  if (deleted) {
    return (
      <div className={`${glass} px-4 py-3 text-sm text-muted-foreground flex items-center gap-2 max-w-md`}>
        <Trash2 className="h-4 w-4" />
        Cancelled "{task.title}"
      </div>
    );
  }

  return (
    <div className={`${glass} p-4 max-w-md flex flex-col gap-3`}>
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-primary/15 text-primary p-2 shrink-0">
          {isCron ? <Repeat className="h-4 w-4" /> : <Calendar className="h-4 w-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate">{task.title}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
            <Clock className="h-3 w-3" />
            {formatWhen(task.next_run_at, isCron, task.cron_expr)}
          </div>
          <div className="text-xs text-muted-foreground/80 mt-1 line-clamp-2">{task.prompt}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {task.deliver_in_chat && (
          <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-primary/10 text-primary flex items-center gap-1">
            <MessageSquare className="h-3 w-3" /> Chat
          </span>
        )}
        {task.deliver_push && (
          <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-primary/10 text-primary flex items-center gap-1">
            <Bell className="h-3 w-3" /> Push
          </span>
        )}
        {task.deliver_email && (
          <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-primary/10 text-primary flex items-center gap-1">
            <Mail className="h-3 w-3" /> Email
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-8 text-xs flex-1"
          onClick={() => navigate("/tasks")}
        >
          <ExternalLink className="h-3 w-3 mr-1.5" /> Manage
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 text-xs text-destructive hover:text-destructive"
          disabled={deleting}
          onClick={handleDelete}
        >
          <Trash2 className="h-3 w-3 mr-1.5" /> Cancel
        </Button>
      </div>
    </div>
  );
}
