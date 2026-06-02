// Runs every minute via pg_cron. Finds due scheduled tasks, runs each through
// the Lovable AI Gateway, saves the result as a new chat session message, and
// fires a push notification when push_on_complete is true.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

// Very small cron parser: supports `*`, `*/n`, comma lists, and ranges.
// Returns next run time after `from` in UTC.
function fieldMatches(value: number, expr: string): boolean {
  if (expr === "*") return true;
  for (const part of expr.split(",")) {
    if (part.startsWith("*/")) {
      const n = parseInt(part.slice(2), 10);
      if (n > 0 && value % n === 0) return true;
    } else if (part.includes("-")) {
      const [a, b] = part.split("-").map((v) => parseInt(v, 10));
      if (value >= a && value <= b) return true;
    } else if (parseInt(part, 10) === value) {
      return true;
    }
  }
  return false;
}

function nextCronRun(expr: string, from: Date): Date {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return new Date(from.getTime() + 60 * 60 * 1000);
  const [mins, hours, dom, mon, dow] = parts;
  const d = new Date(from.getTime() + 60 * 1000);
  d.setUTCSeconds(0, 0);
  for (let i = 0; i < 525600; i++) {
    if (
      fieldMatches(d.getUTCMinutes(), mins) &&
      fieldMatches(d.getUTCHours(), hours) &&
      fieldMatches(d.getUTCDate(), dom) &&
      fieldMatches(d.getUTCMonth() + 1, mon) &&
      fieldMatches(d.getUTCDay(), dow)
    ) {
      return d;
    }
    d.setUTCMinutes(d.getUTCMinutes() + 1);
  }
  return new Date(from.getTime() + 60 * 60 * 1000);
}

async function callAi(prompt: string, model: string): Promise<string> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "You are Arc, completing a user's scheduled task. Be concise and useful." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`AI gateway ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const json = await res.json();
  return json?.choices?.[0]?.message?.content ?? "";
}

async function processTask(task: any): Promise<void> {
  const { data: run } = await admin
    .from("scheduled_task_runs")
    .insert({ task_id: task.id, user_id: task.user_id, status: "running" })
    .select("id")
    .single();

  try {
    const output = await callAi(task.prompt, task.model || "google/gemini-2.5-flash");

    // Build messages payload for chat_sessions
    const now = new Date().toISOString();
    const userMsg = {
      id: crypto.randomUUID(),
      role: "user",
      type: "text",
      content: task.prompt,
      createdAt: now,
    };
    const aiMsg = {
      id: crypto.randomUUID(),
      role: "assistant",
      type: "text",
      content: output,
      createdAt: now,
    };

    let chatId = task.result_chat_id as string | null;
    if (chatId) {
      const { data: existing } = await admin
        .from("chat_sessions").select("messages").eq("id", chatId).maybeSingle();
      const merged = [...((existing?.messages as any[]) ?? []), userMsg, aiMsg];
      await admin.from("chat_sessions")
        .update({ messages: merged, updated_at: now }).eq("id", chatId);
    } else {
      const { data: created } = await admin
        .from("chat_sessions")
        .insert({
          user_id: task.user_id,
          title: `📅 ${task.title}`,
          messages: [userMsg, aiMsg],
        })
        .select("id").single();
      chatId = created?.id ?? null;
      if (chatId) {
        await admin.from("scheduled_tasks").update({ result_chat_id: chatId }).eq("id", task.id);
      }
    }

    await admin.from("scheduled_task_runs")
      .update({
        status: "succeeded",
        finished_at: new Date().toISOString(),
        output: output.slice(0, 8000),
        chat_session_id: chatId,
      })
      .eq("id", run!.id);

    // Schedule next
    const updates: any = { last_run_at: new Date().toISOString() };
    if (task.schedule_type === "once") {
      updates.status = "completed";
      updates.next_run_at = null;
    } else if (task.cron_expr) {
      updates.next_run_at = nextCronRun(task.cron_expr, new Date()).toISOString();
    }
    await admin.from("scheduled_tasks").update(updates).eq("id", task.id);

    // Push
    if (task.push_on_complete) {
      await fetch(`${SUPABASE_URL}/functions/v1/send-push-notification`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_ids: [task.user_id],
          payload: {
            title: `✅ ${task.title}`,
            body: output.slice(0, 140) || "Your scheduled task finished.",
            url: chatId ? `/chat/${chatId}` : "/dashboard",
            tag: `task-${task.id}`,
          },
        }),
      }).catch((e) => console.error("push failed", e));
    }
  } catch (err: any) {
    console.error("task failed", task.id, err);
    await admin.from("scheduled_task_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error: String(err?.message ?? err).slice(0, 2000),
      })
      .eq("id", run!.id);
    await admin.from("scheduled_tasks")
      .update({
        status: task.schedule_type === "once" ? "failed" : "active",
        last_run_at: new Date().toISOString(),
        next_run_at: task.schedule_type === "cron" && task.cron_expr
          ? nextCronRun(task.cron_expr, new Date()).toISOString()
          : task.next_run_at,
      })
      .eq("id", task.id);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const nowIso = new Date().toISOString();
    const { data: tasks, error } = await admin
      .from("scheduled_tasks")
      .select("*")
      .eq("status", "active")
      .lte("next_run_at", nowIso)
      .limit(25);

    if (error) throw error;
    if (!tasks?.length) {
      return new Response(JSON.stringify({ ran: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark next_run_at forward to avoid duplicate pickup within the 55s window
    await Promise.all(tasks.map((t) =>
      admin.from("scheduled_tasks")
        .update({ next_run_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() })
        .eq("id", t.id)
    ));

    // Process sequentially to stay under timeout for small batches
    for (const t of tasks) {
      await processTask(t);
    }

    return new Response(JSON.stringify({ ran: tasks.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("run-scheduled-tasks error", e);
    return new Response(JSON.stringify({ error: String((e as any)?.message ?? e) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
