// Runs every minute via pg_cron. Finds due scheduled tasks, runs each through
// OpenAI, saves the result as a new chat session message, and
// fires a push notification when push_on_complete is true.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const CRON_SECRET = Deno.env.get("SCHEDULED_TASKS_CRON_SECRET") ?? "";
const SITE_URL = "https://askarc.chat";
const SENDER_DOMAIN = "notify.askarc.chat";

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

const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get current weather + short forecast for a location. Use for any weather/forecast/temperature task.",
      parameters: {
        type: "object",
        properties: { location: { type: "string", description: "City, state/country (e.g. 'Plainfield, IL')" } },
        required: ["location"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the live web for current info: news, headlines, prices, scores, events. Use for any 'today's news / digest / latest' style task.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Concise search query" } },
        required: ["query"],
      },
    },
  },
] as const;

async function runTool(name: string, args: any): Promise<string> {
  try {
    if (name === "get_weather") {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/get-weather`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ location: args?.location }),
      });
      const json = await res.json().catch(() => ({}));
      return JSON.stringify(json).slice(0, 4000);
    }
    if (name === "web_search") {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/perplexity-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ query: args?.query }),
      });
      const json = await res.json().catch(() => ({}));
      // perplexity-search returns formatted/sources; trim aggressively
      const out = json?.formatted || json?.content || JSON.stringify(json);
      return String(out).slice(0, 6000);
    }
    return `Unknown tool: ${name}`;
  } catch (e) {
    return `Tool ${name} failed: ${String((e as any)?.message ?? e).slice(0, 300)}`;
  }
}

async function callAi(prompt: string, model: string, taskTitle: string): Promise<string> {
  const system = `You are Arc, proactively pinging the user because a reminder/task they scheduled is due RIGHT NOW. You are NOT responding to a fresh request — you are the one initiating contact.

Rules:
- Write as a proactive notification FROM you TO the user (e.g. "Hey! Time to grab eggs from the store 🥚" — not "I've added eggs to your list").
- Address the user directly in second person. Be warm, brief, and human (1–3 sentences for simple reminders).
- If the scheduled task asks for content (weather, news digest, summary, joke, etc.), USE THE TOOLS (get_weather, web_search) to fetch real current data, then deliver the content directly with a tiny lead-in.
- Never claim you did an action you didn't actually do.
- Never mention links, emails, or push notifications — those are handled separately.
- Do not restate the schedule or that this was scheduled; the user knows.`;

  const userMsg = `The user scheduled this reminder/task earlier: "${taskTitle}"\n\nTheir original instructions were:\n"""${prompt}"""\n\nThe scheduled time has arrived. Use tools if needed (weather → get_weather; news/web → web_search), then send them the proactive ping now.`;

  const messages: any[] = [
    { role: "system", content: system },
    { role: "user", content: userMsg },
  ];

  for (let iter = 0; iter < 3; iter++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({ model, messages, tools: TOOLS, tool_choice: "auto" }),
    });
    if (!res.ok) throw new Error(`AI gateway ${res.status}: ${await res.text().catch(() => "")}`);
    const json = await res.json();
    const msg = json?.choices?.[0]?.message;
    if (!msg) return "";
    const toolCalls = msg.tool_calls;
    if (!toolCalls || toolCalls.length === 0) {
      return msg.content ?? "";
    }
    // Push assistant tool-call turn + each tool result
    messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: toolCalls });
    for (const tc of toolCalls) {
      let args: any = {};
      try { args = JSON.parse(tc.function?.arguments ?? "{}"); } catch { /* ignore */ }
      const result = await runTool(tc.function?.name, args);
      messages.push({ role: "tool", tool_call_id: tc.id, content: result });
    }
  }
  // Final synth pass with no tools, in case loop exhausted
  const finalRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({ model, messages }),
  });
  const finalJson = await finalRes.json().catch(() => ({}));
  return finalJson?.choices?.[0]?.message?.content ?? "";
}

async function sendTaskEmail(email: string, taskTitle: string, preview: string, chatUrl: string, idempotencyKey: string) {
  // Deliver through send-transactional-email so the reminder uses the shared
  // branded template (current theme/logo) plus its suppression, unsubscribe,
  // idempotency, and send-log handling.
  const response = await fetch(`${SUPABASE_URL}/functions/v1/send-transactional-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({
      templateName: "scheduled-task-complete",
      recipientEmail: email,
      idempotencyKey,
      templateData: { taskTitle, preview, chatUrl },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`send-transactional-email returned ${response.status}: ${errorText}`);
  }
}

async function processTask(task: any): Promise<void> {
  const { data: run } = await admin
    .from("scheduled_task_runs")
    .insert({ task_id: task.id, user_id: task.user_id, status: "running" })
    .select("id")
    .single();

  try {
    const output = await callAi(task.prompt, task.model || "gpt-5.4-mini", task.title);

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
      scheduledTask: { id: task.id, title: task.title },
    };

    let chatId = task.result_chat_id as string | null;
    if (chatId) {
      // Append ONLY the assistant message so it looks like Arc proactively pinged the user.
      const { data: existing } = await admin
        .from("chat_sessions").select("messages, title, created_at").eq("id", chatId).maybeSingle();
      const merged = [...((existing?.messages as any[]) ?? []), aiMsg];
      const { error: updateError } = await admin.from("chat_sessions")
        .upsert({
          id: chatId,
          user_id: task.user_id,
          title: existing?.title || `📅 ${task.title}`,
          messages: merged,
          created_at: existing?.created_at || now,
          updated_at: now,
        }, { onConflict: "id" });
      if (updateError) throw updateError;
    } else {
      // No existing chat → start a new one with the original prompt + reply for context.
      const { data: created } = await admin
        .from("chat_sessions")
        .insert({
          user_id: task.user_id,
          title: `📅 ${task.title}`,
          messages: [userMsg, aiMsg],
        })
        .select("id").single();
      if (!created?.id) throw new Error("Could not create task result chat");
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

    if (task.notify_email) {
      try {
        const { data: u } = await admin.auth.admin.getUserById(task.user_id);
        const email = u?.user?.email;
        if (email) {
          const chatUrl = chatId ? `${SITE_URL}/chat/${chatId}` : `${SITE_URL}/dashboard`;
          await sendTaskEmail(email, task.title, output.slice(0, 1200), chatUrl, `task-${task.id}-${run!.id}`);
        }
      } catch (e) {
        console.error("task email failed", e);
        await admin.from("scheduled_task_runs")
          .update({ error: `Email failed: ${String((e as any)?.message ?? e).slice(0, 500)}` })
          .eq("id", run!.id);
      }
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

  const isServiceCall = req.headers.get("Authorization") === `Bearer ${SERVICE_KEY}`;
  const isCronCall = CRON_SECRET.length > 0 && req.headers.get("x-cron-secret") === CRON_SECRET;
  if (!isServiceCall && !isCronCall) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

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
