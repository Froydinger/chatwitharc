import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "public, max-age=15, stale-while-revalidate=45",
};

const EXACT_ROUTES = new Set([
  "/", "/welcome", "/blog", "/downloads", "/pricing", "/upgrade",
  "/dashboard", "/dashboard/settings", "/support", "/docs", "/tasks",
  "/shared", "/terms", "/privacy", "/status",
]);

const DYNAMIC_ROUTES: Array<[RegExp, string]> = [
  [/^\/blog\/[^/]+$/, "/blog/:slug"],
  [/^\/chat\/[^/]+$/, "/chat/:sessionId"],
  [/^\/share\/[^/]+$/, "/share/:sessionId"],
  [/^\/shared\/[^/]+$/, "/shared/:chatId"],
];

type JobRow = { status: string; created_at: string };
type ServiceStatus = "operational" | "degraded" | "outage";
type ServiceHealth = {
  id: string;
  name: string;
  status: ServiceStatus;
  latencyMs?: number;
  detail: string;
};

let cachedHealth: { expiresAt: number; payload: Record<string, unknown> } | null = null;

function response(body: unknown, status = 200, cacheable = false): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: cacheable ? jsonHeaders : { ...jsonHeaders, "Cache-Control": "no-store" },
  });
}

function canonicalRoute(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 200) return null;

  let pathname: string;
  try {
    pathname = new URL(input, "https://arc.invalid").pathname;
  } catch {
    return null;
  }

  pathname = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (EXACT_ROUTES.has(pathname)) return pathname;

  for (const [pattern, canonical] of DYNAMIC_ROUTES) {
    if (pattern.test(pathname)) return canonical;
  }
  return null;
}

function summarize(id: string, name: string, rows: JobRow[] | null, error: unknown, latencyMs: number): ServiceHealth {
  if (error || !rows) {
    return { id, name, status: "degraded", latencyMs, detail: "Recent operational data is temporarily unavailable." };
  }

  const succeeded = rows.filter((row) => row.status === "completed" || row.status === "succeeded").length;
  const failed = rows.filter((row) => row.status === "failed").length;
  const finished = succeeded + failed;
  const degraded = finished >= 5 && failed / finished > 0.25;

  return {
    id,
    name,
    status: degraded ? "degraded" : "operational",
    latencyMs,
    detail: finished === 0
      ? "No completed operations in the last 24 hours."
      : `${succeeded} succeeded and ${failed} failed in the last 24 hours.`,
  };
}

async function timed<T>(operation: PromiseLike<T>): Promise<{ result: T; latencyMs: number }> {
  const startedAt = performance.now();
  const result = await operation;
  return { result, latencyMs: Math.round(performance.now() - startedAt) };
}

function adminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new Error("service configuration unavailable");

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function healthPayload(): Promise<Record<string, unknown>> {
  const now = Date.now();
  if (cachedHealth && cachedHealth.expiresAt > now) return cachedHealth.payload;

  const admin = adminClient();
  const since = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  const [databaseCheck, imageCheck, videoCheck, reminderCheck] = await Promise.all([
    timed(admin.from("anonymous_route_traffic").select("traffic_date", { head: true, count: "exact" }).limit(1)),
    timed(admin.from("image_generation_jobs").select("status,created_at").gte("created_at", since).limit(5000)),
    timed(admin.from("video_generation_jobs").select("status,created_at").gte("created_at", since).limit(5000)),
    timed(admin.from("scheduled_task_runs").select("status,started_at").gte("started_at", since).limit(5000)),
  ]);

  const database = databaseCheck.result;
  const images = imageCheck.result;
  const videos = videoCheck.result;
  const reminders = reminderCheck.result;
  const services: ServiceHealth[] = [
    { id: "edge", name: "ArcAI API", status: "operational", detail: "The public health endpoint is responding." },
    {
      id: "database",
      name: "Database",
      status: database.error ? "outage" : "operational",
      latencyMs: databaseCheck.latencyMs,
      detail: database.error ? "The database health check failed." : "Database connectivity is operational.",
    },
    summarize("images", "Image generation", (images.data ?? []) as JobRow[], images.error, imageCheck.latencyMs),
    summarize("video", "Video generation", (videos.data ?? []) as JobRow[], videos.error, videoCheck.latencyMs),
    summarize(
      "reminders",
      "Reminders",
      (reminders.data ?? []).map((row) => ({ status: row.status, created_at: row.started_at })) as JobRow[],
      reminders.error,
      reminderCheck.latencyMs,
    ),
  ];

  const states = services.map((service) => service.status);
  const payload = {
    overall: states.includes("outage") ? "outage" : states.includes("degraded") ? "degraded" : "operational",
    checkedAt: new Date(now).toISOString(),
    services,
  };

  cachedHealth = { expiresAt: now + 30_000, payload };
  return payload;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  try {
    if (req.method === "GET") return response(await healthPayload(), 200, true);
    if (req.method !== "POST") return response({ error: "method_not_allowed" }, 405);

    const body = await req.json().catch(() => null) as { action?: unknown; path?: unknown } | null;
    if (!body || typeof body.action !== "string") return response({ error: "invalid_request" }, 400);

    if (body.action === "health") return response(await healthPayload(), 200, true);

    if (body.action === "pageview") {
      const route = canonicalRoute(body.path);
      if (!route) return response({ error: "route_not_allowed" }, 400);

      const { error } = await adminClient().rpc("record_anonymous_pageview", { route_name: route });
      if (error) throw error;
      return response({ ok: true }, 202);
    }

    return response({ error: "unknown_action" }, 400);
  } catch (error) {
    console.error("system-health request failed", error instanceof Error ? error.message : "unknown error");
    return response({
      overall: "outage",
      checkedAt: new Date().toISOString(),
      services: [{
        id: "system-health",
        name: "ArcAI status checks",
        status: "outage",
        detail: "Live health checks are temporarily unavailable.",
      }],
    }, 503);
  }
});
