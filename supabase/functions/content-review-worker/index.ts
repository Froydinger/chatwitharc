import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

// This worker only creates human-review leads. It never hides content, changes
// an account, contacts a user, or reports content to an outside authority.
const url = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const cronSecret = Deno.env.get("CONTENT_REVIEW_CRON_SECRET") ?? "";
const openaiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

type QueueItem = {
  id: number;
  run_id: string;
  source_type: "chat" | "shared_chat" | "image";
  source_id: string;
  owner_id: string;
  bucket: string | null;
  object_path: string | null;
  attempts: number;
};
type Moderation = {
  categories?: Record<string, boolean>;
  category_applied_input_types?: Record<string, string[]>;
};
const TEXT_SIGNALS = new Set([
  "sexual", "sexual/minors", "violence/graphic", "illicit/violent",
  "self-harm/instructions", "hate/threatening", "harassment/threatening",
]);
const IMAGE_SIGNALS = new Set(["sexual", "violence/graphic", "self-harm/instructions"]);

function authorized(req: Request): boolean {
  const received = req.headers.get("x-cron-secret") ?? "";
  if (!cronSecret || !received || received.length !== cronSecret.length) return false;
  let mismatch = 0;
  for (let i = 0; i < received.length; i++) mismatch |= received.charCodeAt(i) ^ cronSecret.charCodeAt(i);
  return mismatch === 0;
}

async function moderate(input: string[] | Array<{ type: "image_url"; image_url: { url: string } }>): Promise<Moderation[]> {
  const response = await fetch("https://api.openai.com/v1/moderations", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "omni-moderation-latest", input }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`moderation_http_${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data?.results) || data.results.length !== input.length) throw new Error("moderation_result_shape");
  return data.results;
}

function signals(result: Moderation, kind: "text" | "image"): string[] {
  const allowed = kind === "image" ? IMAGE_SIGNALS : TEXT_SIGNALS;
  return Object.entries(result.categories ?? {})
    .filter(([category, active]) => active && allowed.has(category)
      && (result.category_applied_input_types?.[category]?.includes(kind) ?? true))
    .map(([category]) => category);
}

async function finish(item: QueueItem, found: string[] | null, failure?: string) {
  if (found?.length) {
    const { error } = await admin.from("content_review_flags").upsert({
      source_type: item.source_type, source_id: item.source_id,
      owner_id: item.owner_id, bucket: item.bucket, object_path: item.object_path,
      signals: found,
    }, { onConflict: "source_type,source_id", ignoreDuplicates: true });
    if (error) throw error;
  }
  if (failure && item.attempts < 4) {
    const { error } = await admin.from("content_review_queue")
      .update({ last_error: failure.slice(0, 80), lease_until: new Date(Date.now() + 10 * 60_000).toISOString() })
      .eq("id", item.id);
    if (error) throw error;
    return;
  }
  const { error } = await admin.rpc("content_review_finish", {
    p_id: item.id, p_flagged: !!found?.length, p_failed: !!failure,
  });
  if (error) throw error;
}

async function textFor(item: QueueItem, sessions: Map<string, any>, shared: Map<string, string>): Promise<string | null> {
  if (item.source_type === "shared_chat") return shared.get(item.source_id) ?? null;
  const slash = item.source_id.indexOf("/");
  const session = sessions.get(item.source_id.slice(0, slash));
  if (!session || session.user_id !== item.owner_id) return null;
  const id = item.source_id.slice(slash + 1);
  const messages = Array.isArray(session.messages) ? session.messages : [];
  const message = messages.find((entry: any, index: number) => String(entry?.id || index + 1) === id);
  return typeof message?.content === "string" ? message.content : null;
}

async function imageUrl(item: QueueItem): Promise<string> {
  if (!item.bucket || !item.object_path || !item.object_path.startsWith(`${item.owner_id}/`)) {
    throw new Error("image_owner_path_invalid");
  }
  if (item.bucket === "r2-legacy") {
    const worker = Deno.env.get("R2_WORKER_URL")?.replace(/\/$/, "");
    if (!worker) throw new Error("r2_unavailable");
    return `${worker}/objects/${item.object_path.split("/").map(encodeURIComponent).join("/")}`;
  }
  const { data, error } = await admin.storage.from(item.bucket).createSignedUrl(item.object_path, 600);
  if (error || !data?.signedUrl) throw new Error("image_sign_failed");
  return data.signedUrl;
}

async function inventoryR2(run: { id: string; range_start: string; range_end: string }) {
  const worker = Deno.env.get("R2_WORKER_URL")?.replace(/\/$/, "");
  const secret = Deno.env.get("R2_WORKER_SECRET");
  if (!worker || !secret) throw new Error("r2_inventory_unavailable");
  const { data: admins, error: adminError } = await admin.from("admin_users")
    .select("user_id").eq("is_primary_admin", true);
  if (adminError) throw adminError;
  const excluded = new Set((admins ?? []).map((row: any) => row.user_id));
  const batch: Array<Record<string, unknown>> = [];
  let cursor: string | null = null;
  do {
    const endpoint = new URL(`${worker}/admin/list`);
    endpoint.searchParams.set("limit", "1000");
    if (cursor) endpoint.searchParams.set("cursor", cursor);
    const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${secret}` } });
    if (!response.ok) throw new Error(`r2_inventory_http_${response.status}`);
    const page = await response.json();
    for (const object of Array.isArray(page?.objects) ? page.objects : []) {
      const path = object?.key;
      if (typeof path !== "string" || !/^[0-9a-f-]{36}\//i.test(path)) continue;
      const ownerId = path.split("/", 1)[0];
      if (excluded.has(ownerId) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ownerId)) continue;
      if (!/\.(avif|bmp|gif|heic|heif|jpe?g|png|webp)$/i.test(path) && !String(object.contentType ?? "").startsWith("image/")) continue;
      const uploaded = Date.parse(object.uploaded ?? "");
      if (!Number.isFinite(uploaded) || uploaded < Date.parse(run.range_start) || uploaded >= Date.parse(run.range_end)) continue;
      batch.push({ run_id: run.id, source_type: "image", source_id: `r2-legacy/${path}`,
        owner_id: ownerId, bucket: "r2-legacy", object_path: path });
    }
    if (batch.length) {
      const { error } = await admin.from("content_review_queue").upsert(batch.splice(0),
        { onConflict: "run_id,source_type,source_id", ignoreDuplicates: true });
      if (error) throw error;
    }
    cursor = page?.truncated && typeof page.cursor === "string" ? page.cursor : null;
  } while (cursor);
  const { error } = await admin.from("content_review_runs").update({ r2_inventoried: true }).eq("id", run.id);
  if (error) throw error;
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!authorized(req)) return new Response("Unauthorized", { status: 401 });
  if (!openaiKey || !serviceKey) return new Response("Scanner unavailable", { status: 503 });
  try {
    const { data: runs, error: runError } = await admin.rpc("content_review_ensure_week");
    if (runError) throw runError;
    const run = Array.isArray(runs) ? runs[0] : null;
    if (!run) return Response.json({ status: "idle" });
    if (run.needs_r2) {
      const { data: details, error } = await admin.from("content_review_runs")
        .select("id,range_start,range_end").eq("id", run.run_id).single();
      if (error) throw error;
      await inventoryR2(details);
    }
    const { error: reapError } = await admin.rpc("content_review_reap_exhausted", { p_run_id: run.run_id });
    if (reapError) throw reapError;
    const { data: claimed, error: claimError } = await admin.rpc("content_review_claim", {
      p_run_id: run.run_id, p_limit: 32,
    });
    if (claimError) throw claimError;
    const items = (claimed ?? []) as QueueItem[];
    const textItems = items.filter(item => item.source_type !== "image");
    const sessions = new Map<string, any>();
    const sessionIds = [...new Set(textItems.filter(item => item.source_type === "chat")
      .map(item => item.source_id.split("/", 1)[0]))];
    if (sessionIds.length) {
      const { data, error } = await admin.from("chat_sessions").select("id,user_id,messages").in("id", sessionIds);
      if (error) throw error;
      for (const session of data ?? []) sessions.set(session.id, session);
    }
    const shared = new Map<string, string>();
    const sharedIds = textItems.filter(item => item.source_type === "shared_chat").map(item => item.source_id);
    if (sharedIds.length) {
      const { data, error } = await admin.from("shared_chat_messages").select("id,content").in("id", sharedIds);
      if (error) throw error;
      for (const message of data ?? []) shared.set(message.id, message.content);
    }
    const foundText: Array<{ item: QueueItem; content: string }> = [];
    for (const item of textItems) {
      const content = await textFor(item, sessions, shared);
      if (content) foundText.push({ item, content });
      else await finish(item, null, "source_missing");
    }
    // Scan full messages in bounded chunks; never silently truncate a message.
    await Promise.all(foundText.map(async ({ item, content }) => {
      try {
        const collected = new Set<string>();
        for (let start = 0; start < content.length; start += 16_000) {
          const results = await moderate([content.slice(start, start + 16_000)]);
          for (const signal of signals(results[0], "text")) collected.add(signal);
        }
        await finish(item, [...collected]);
      } catch (error) {
        await finish(item, null, error instanceof Error ? error.message : "moderation_failed");
      }
    }));
    await Promise.all(items.filter(entry => entry.source_type === "image").map(async item => {
      try {
        const results = await moderate([{ type: "image_url", image_url: { url: await imageUrl(item) } }]);
        await finish(item, signals(results[0], "image"));
      } catch (error) {
        await finish(item, null, error instanceof Error ? error.message : "image_scan_failed");
      }
    }));
    const { count, error: countError } = await admin.from("content_review_queue")
      .select("id", { count: "exact", head: true }).eq("run_id", run.run_id);
    if (countError) throw countError;
    if (count === 0) {
      const { data: stats } = await admin.from("content_review_runs").select("failed_count").eq("id", run.run_id).single();
      await admin.from("content_review_runs").update({
        status: (stats?.failed_count ?? 0) > 0 ? "partial" : "complete",
        completed_at: new Date().toISOString(),
      }).eq("id", run.run_id);
    }
    return Response.json({ status: "processed", count: items.length });
  } catch (error) {
    console.error("content-review-worker failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "Scan incomplete; will retry" }, { status: 503 });
  }
});
