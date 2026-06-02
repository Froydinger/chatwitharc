// Runs every minute via pg_cron. Finds due scheduled tasks, runs each through
// the Lovable AI Gateway, saves the result as a new chat session message, and
// fires a push notification when push_on_complete is true.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendLovableEmail } from "npm:@lovable.dev/email-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SITE_URL = "https://askarc.chat";
const SENDER_DOMAIN = "notify.askarc.chat";
const FROM_DOMAIN = "askarc.chat";

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
        { role: "system", content: "You are Arc, completing a user's scheduled task. Be concise and useful. Never invent links or claim an email was sent; delivery and chat links are handled by the scheduler after you respond." },
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

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char] ?? char));
}

async function sendTaskEmail(email: string, taskTitle: string, preview: string, chatUrl: string, idempotencyKey: string) {
  const messageId = crypto.randomUUID();
  const normalizedEmail = email.toLowerCase();
  const { data: existingToken } = await admin
    .from("email_unsubscribe_tokens")
    .select("token, used_at")
    .eq("email", normalizedEmail)
    .maybeSingle();
  let unsubscribeToken = existingToken?.used_at ? crypto.randomUUID() : existingToken?.token;
  if (!unsubscribeToken) {
    unsubscribeToken = crypto.randomUUID();
    const { error: tokenError } = await admin
      .from("email_unsubscribe_tokens")
      .upsert({ token: unsubscribeToken, email: normalizedEmail }, { onConflict: "email", ignoreDuplicates: true });
    if (tokenError) throw tokenError;
    const { data: storedToken, error: readTokenError } = await admin
      .from("email_unsubscribe_tokens")
      .select("token")
      .eq("email", normalizedEmail)
      .maybeSingle();
    if (readTokenError || !storedToken?.token) throw readTokenError || new Error("Could not prepare email token");
    unsubscribeToken = storedToken.token;
  }
  const safeTitle = escapeHtml(taskTitle);
  const safePreview = escapeHtml(preview).replace(/\n/g, "<br />");
  const subject = `✅ ${taskTitle} is done`;
  const html = `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#0f172a;"><div style="max-width:560px;margin:0 auto;padding:40px 20px;"><div style="text-align:center;margin-bottom:24px;"><img src="https://jxywhodnndagbsmnbnnw.supabase.co/storage/v1/object/public/email-assets/arc-logo-ui.png" width="56" height="56" alt="ArcAI" style="border-radius:14px;" /></div><div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:36px 28px;text-align:center;"><div style="font-size:44px;line-height:1;margin-bottom:14px;">✅</div><h1 style="font-size:24px;line-height:30px;margin:0 0 12px;font-weight:700;">${safeTitle}</h1><p style="color:#475569;font-size:15px;line-height:24px;margin:0 0 20px;">Your scheduled task finished. Open the saved chat anytime for the full result.</p><div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin:0 0 24px;text-align:left;color:#334155;font-size:14px;line-height:22px;">${safePreview}</div><a href="${chatUrl}" style="display:inline-block;background:#0080f0;color:#ffffff;text-decoration:none;border-radius:10px;padding:14px 32px;font-weight:600;font-size:16px;">Open results</a></div><p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:28px;">© 2026 ArcAI by Win The Night Productions</p></div></body></html>`;
  const text = `${taskTitle}\n\n${preview}\n\nOpen results: ${chatUrl}`;

  await sendLovableEmail({
    to: email,
    from: `ArcAI <noreply@${FROM_DOMAIN}>`,
    sender_domain: SENDER_DOMAIN,
    subject,
    html,
    text,
    purpose: "transactional",
    label: "scheduled-task-complete",
    idempotency_key: idempotencyKey,
    unsubscribe_token: unsubscribeToken,
    message_id: messageId,
  }, { apiKey: LOVABLE_API_KEY, sendUrl: Deno.env.get("LOVABLE_SEND_URL") });

  await admin.from("email_send_log").insert({
    message_id: messageId,
    template_name: "scheduled-task-complete",
    recipient_email: email,
    status: "sent",
  });
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

    // Always send push (even if in-app) so the user knows the task fired
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

    // Always send email too
    try {
      const { data: u } = await admin.auth.admin.getUserById(task.user_id);
      const email = u?.user?.email;
      if (email) {
        const chatUrl = chatId ? `${SITE_URL}/chat/${chatId}` : `${SITE_URL}/dashboard`;
        await sendTaskEmail(email, task.title, output.slice(0, 600), chatUrl, `task-${task.id}-${run!.id}`);
      }
    } catch (e) {
      console.error("task email failed", e);
      await admin.from("scheduled_task_runs")
        .update({ error: `Email failed: ${String((e as any)?.message ?? e).slice(0, 500)}` })
        .eq("id", run!.id);
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
