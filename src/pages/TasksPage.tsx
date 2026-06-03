import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Pause, Play, Trash2, Calendar, Clock, Repeat, CheckCircle2, AlertCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { describeCronSchedule } from "@/lib/scheduleLabels";

interface Task {
  id: string;
  title: string;
  prompt: string;
  schedule_type: "once" | "cron";
  cron_expr: string | null;
  run_at: string | null;
  next_run_at: string | null;
  last_run_at: string | null;
  status: "active" | "paused" | "completed" | "failed";
  push_on_complete: boolean;
  notify_email: boolean;
  result_chat_id: string | null;
  timezone: string;
}

// Simple natural-language → cron mapping for the most common phrasings.
function parseSchedule(input: string): { type: "once" | "cron"; cron?: string; runAt?: string } | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  const tzOffsetMin = new Date().getTimezoneOffset(); // local → UTC offset
  const localCron = (hour: number, minute = 0, suffix = "* * *") => {
    const utcMin = ((hour * 60 + minute + tzOffsetMin) % 1440 + 1440) % 1440;
    return `${utcMin % 60} ${Math.floor(utcMin / 60)} ${suffix}`;
  };
  const presets: Record<string, string> = {
    "every minute": "* * * * *",
    "every 5 minutes": "*/5 * * * *",
    "every 15 minutes": "*/15 * * * *",
    "every 30 minutes": "*/30 * * * *",
    "every hour": "0 * * * *",
    "every day": localCron(9),
    "daily": localCron(9),
    "every morning": localCron(9),
    "every evening": localCron(19),
    "every monday": localCron(9, 0, "* * 1"),
    "every sunday": localCron(9, 0, "* * 0"),
    "every weekday": localCron(9, 0, "* * 1-5"),
    "weekly": localCron(9, 0, "* * 1"),
    "monthly": localCron(9, 0, "1 * *"),
  };
  if (presets[s]) return { type: "cron", cron: presets[s] };

  // "every day at 8am" / "daily at 14:30"
  const m = s.match(/(?:every day|daily|each day|every morning|every evening)\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (m) {
    let h = parseInt(m[1], 10);
    const min = m[2] ? parseInt(m[2], 10) : 0;
    const ap = m[3];
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    // convert local h:min to UTC
    let utcMin = h * 60 + min + tzOffsetMin;
    utcMin = ((utcMin % 1440) + 1440) % 1440;
    const uh = Math.floor(utcMin / 60), um = utcMin % 60;
    return { type: "cron", cron: `${um} ${uh} * * *` };
  }
  // "in N minutes/hours"
  const inMatch = s.match(/^in\s+(\d+)\s*(min|mins|minute|minutes|hour|hours|h|m)$/);
  if (inMatch) {
    const n = parseInt(inMatch[1], 10);
    const unit = inMatch[2].startsWith("h") ? 60 : 1;
    const t = new Date(Date.now() + n * unit * 60 * 1000);
    return { type: "once", runAt: t.toISOString() };
  }
  return null;
}

function describeNext(task: Task): string {
  if (task.status === "paused") return "Paused";
  if (task.status === "completed") return "Completed";
  if (!task.next_run_at) return "—";
  const d = new Date(task.next_run_at);
  return d.toLocaleString();
}

export function TasksPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  // form
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [scheduleText, setScheduleText] = useState("every day at 8am");
  const [pushOn, setPushOn] = useState(true);
  const [emailOn, setEmailOn] = useState(false);
  
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate("/");
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    void load();
    const ch = supabase
      .channel(`tasks-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "scheduled_tasks", filter: `user_id=eq.${user.id}` }, () => void load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  async function load() {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("scheduled_tasks")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setTasks((data as any) ?? []);
    setLoading(false);
  }

  async function create() {
    if (!user) return;
    if (!title.trim() || !prompt.trim()) {
      toast({ title: "Missing fields", description: "Give your task a title and prompt." });
      return;
    }
    const parsed = parseSchedule(scheduleText);
    if (!parsed) {
      toast({ title: "Can't parse schedule", description: "Try 'every day at 8am', 'every hour', or 'in 30 minutes'.", variant: "destructive" });
      return;
    }
    setCreating(true);
    const nextRun = parsed.type === "once" ? parsed.runAt! : computeNextFromCron(parsed.cron!);
    const { error } = await supabase.from("scheduled_tasks").insert({
      user_id: user.id,
      title: title.trim(),
      prompt: prompt.trim(),
      schedule_type: parsed.type,
      cron_expr: parsed.cron ?? null,
      run_at: parsed.runAt ?? null,
      next_run_at: nextRun,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      push_on_complete: pushOn,
      notify_email: emailOn,
    });
    setCreating(false);
    if (error) {
      toast({ title: "Failed to create", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Task scheduled", description: `Next run: ${new Date(nextRun).toLocaleString()}` });
    setTitle(""); setPrompt(""); setScheduleText("every day at 8am");
    setShowNew(false);
    void load();
  }

  async function toggleStatus(t: Task) {
    const next = t.status === "active" ? "paused" : "active";
    await supabase.from("scheduled_tasks").update({ status: next }).eq("id", t.id);
    void load();
  }

  async function remove(t: Task) {
    if (!confirm(`Delete "${t.title}"?`)) return;
    await supabase.from("scheduled_tasks").delete().eq("id", t.id);
    void load();
  }

  async function runNow(t: Task) {
    await supabase.from("scheduled_tasks").update({ next_run_at: new Date().toISOString(), status: "active" }).eq("id", t.id);
    toast({ title: "Queued", description: "Your task will run within ~1 minute." });
    void load();
  }

  if (authLoading || !user) return null;

  return (
    <div className="min-h-screen w-full text-foreground" style={{ paddingTop: "calc(env(safe-area-inset-top) + 30px)" }}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Dashboard
          </Button>
          <Button onClick={() => setShowNew((v) => !v)} className="gap-2">
            <Plus className="h-4 w-4" /> New task
          </Button>
        </div>

        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <h1 className="text-3xl font-semibold flex items-center gap-3">
            <Calendar className="h-7 w-7 text-primary" /> Scheduled Tasks
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Arc runs prompts on a schedule and pings you when they're done.
          </p>
        </motion.div>

        {showNew && (
          <GlassCard className="p-5 mb-6 space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Morning briefing" />
            </div>
            <div className="space-y-2">
              <Label>Prompt</Label>
              <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Give me a 3-bullet briefing on AI news from the last 24 hours." rows={4} />
            </div>
            <div className="space-y-2">
              <Label>Schedule</Label>
              <Input value={scheduleText} onChange={(e) => setScheduleText(e.target.value)} placeholder="every day at 8am" />
              <p className="text-xs text-muted-foreground">
                Try: <code>every day at 8am</code>, <code>every hour</code>, <code>every monday</code>, <code>in 30 minutes</code>
              </p>
            </div>
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">Push notification when done</Label>
              <Switch checked={pushOn} onCheckedChange={setPushOn} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">Email me the results</Label>
              <Switch checked={emailOn} onCheckedChange={setEmailOn} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowNew(false)}>Cancel</Button>
              <Button onClick={create} disabled={creating}>{creating ? "Scheduling…" : "Schedule task"}</Button>
            </div>
          </GlassCard>
        )}

        {loading ? (
          <GlassCard className="p-8 text-center text-muted-foreground">Loading…</GlassCard>
        ) : tasks.length === 0 ? (
          <GlassCard className="p-10 text-center">
            <Clock className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground">No scheduled tasks yet.</p>
            <Button onClick={() => setShowNew(true)} className="mt-4 gap-2">
              <Plus className="h-4 w-4" /> Create your first task
            </Button>
          </GlassCard>
        ) : (
          <div className="space-y-3">
            {tasks.map((t) => (
              <GlassCard key={t.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{t.title}</span>
                      <StatusPill status={t.status} />
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        {t.schedule_type === "cron" ? <Repeat className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                        {t.schedule_type === "cron" ? describeCronSchedule(t.cron_expr, t.next_run_at) : "once"}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{t.prompt}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span>Next: {describeNext(t)}</span>
                      {t.last_run_at && <span>· Last: {new Date(t.last_run_at).toLocaleString()}</span>}
                      {t.result_chat_id && (
                        <button className="text-primary underline" onClick={() => navigate(`/chat/${t.result_chat_id}`)}>
                          View results
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => runNow(t)} title="Run now">
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => toggleStatus(t)} title={t.status === "active" ? "Pause" : "Resume"}>
                      {t.status === "active" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(t)} title="Delete">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: Task["status"] }) {
  const map = {
    active: { label: "Active", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", Icon: CheckCircle2 },
    paused: { label: "Paused", cls: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30", Icon: Pause },
    completed: { label: "Done", cls: "bg-blue-500/15 text-blue-300 border-blue-500/30", Icon: CheckCircle2 },
    failed: { label: "Failed", cls: "bg-red-500/15 text-red-300 border-red-500/30", Icon: AlertCircle },
  } as const;
  const it = map[status];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${it.cls}`}>
      <it.Icon className="h-3 w-3" />{it.label}
    </span>
  );
}

// Minimal client-side cron next-time, mirrors edge fn rules.
function computeNextFromCron(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const match = (val: number, e: string): boolean => {
    if (e === "*") return true;
    for (const p of e.split(",")) {
      if (p.startsWith("*/")) { const n = parseInt(p.slice(2), 10); if (n > 0 && val % n === 0) return true; }
      else if (p.includes("-")) { const [a, b] = p.split("-").map((v) => parseInt(v, 10)); if (val >= a && val <= b) return true; }
      else if (parseInt(p, 10) === val) return true;
    }
    return false;
  };
  const [mins, hours, dom, mon, dow] = parts;
  const d = new Date();
  d.setUTCSeconds(0, 0); d.setUTCMinutes(d.getUTCMinutes() + 1);
  for (let i = 0; i < 525600; i++) {
    if (match(d.getUTCMinutes(), mins) && match(d.getUTCHours(), hours)
      && match(d.getUTCDate(), dom) && match(d.getUTCMonth() + 1, mon) && match(d.getUTCDay(), dow)) return d.toISOString();
    d.setUTCMinutes(d.getUTCMinutes() + 1);
  }
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}
