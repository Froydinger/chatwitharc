import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getVideoProvider, CONTENT_TTL_MS } from "../_shared/videoProvider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * The client's poll drives the provider poll. Nothing long-running lives on
 * the server, so a render that takes minutes can't be killed by an edge
 * runtime timeout the way a background task would be.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing authorization header" }, 401);
  const token = authHeader.replace("Bearer ", "");

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return json({ error: "Invalid or expired token" }, 401);

  let jobId: string | undefined;
  try {
    if (req.method === "GET") {
      jobId = new URL(req.url).searchParams.get("jobId") || undefined;
    } else {
      const body = await req.json().catch(() => ({}));
      jobId = body?.jobId;
    }
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  if (!jobId) return json({ error: "jobId required" }, 400);

  const { data: job, error } = await supabase
    .from("video_generation_jobs")
    .select("id, user_id, status, mode, prompt, seconds, size, provider_video_id, content_expires_at, error_message, error_type")
    .eq("id", jobId)
    .single();

  if (error || !job) return json({ error: "Job not found" }, 404);
  if (job.user_id !== user.id) return json({ error: "Forbidden" }, 403);

  const respond = (status: string, extra: Record<string, unknown> = {}) =>
    json({
      jobId: job.id,
      status,
      mode: job.mode,
      prompt: job.prompt,
      seconds: job.seconds,
      size: job.size,
      contentExpiresAt: job.content_expires_at,
      errorMessage: job.error_message,
      errorType: job.error_type,
      ...extra,
    });

  // Settled jobs are answered straight from the row.
  if (job.status === "completed" || job.status === "failed") {
    return respond(job.status, { progress: job.status === "completed" ? 100 : 0 });
  }

  if (!job.provider_video_id) {
    return respond("processing", { progress: 0 });
  }

  const provider = getVideoProvider();
  if (!provider) return json({ error: "Video backend is not configured" }, 500);

  const result = await provider.poll(job.provider_video_id);

  if (!result.ok) {
    // A transient provider blip must not kill a render that is still running.
    // Report it as still-processing and let the client poll again.
    console.warn(`[video job ${job.id}] poll error: ${result.errorType} ${result.debugDetail.slice(0, 200)}`);
    return respond("processing", { progress: 0 });
  }

  if (result.status === "completed") {
    const expiresAt = new Date(Date.now() + CONTENT_TTL_MS).toISOString();
    await supabase.from("video_generation_jobs")
      .update({ status: "completed", content_expires_at: expiresAt, error_message: null, error_type: null })
      .eq("id", job.id);
    await supabase.rpc("finalize_video_quota", { target_job_id: job.id, succeeded: true });
    console.log(`[video job ${job.id}] completed`);
    return json({
      jobId: job.id,
      status: "completed",
      progress: 100,
      mode: job.mode,
      prompt: job.prompt,
      seconds: job.seconds,
      size: job.size,
      contentExpiresAt: expiresAt,
      errorMessage: null,
      errorType: null,
    });
  }

  if (result.status === "failed") {
    const errorMessage = result.errorMessage || "The video render failed.";
    const errorType = result.errorType || "provider_error";
    await supabase.from("video_generation_jobs")
      .update({ status: "failed", error_message: errorMessage, error_type: errorType })
      .eq("id", job.id);
    await supabase.rpc("finalize_video_quota", { target_job_id: job.id, succeeded: false });
    console.error(`[video job ${job.id}] failed: ${errorType}`);
    return json({
      jobId: job.id,
      status: "failed",
      progress: 0,
      mode: job.mode,
      prompt: job.prompt,
      seconds: job.seconds,
      size: job.size,
      errorMessage,
      errorType,
    });
  }

  return respond("processing", { progress: result.progress });
});
