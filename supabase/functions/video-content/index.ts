import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getVideoProvider } from "../_shared/videoProvider.ts";

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
 * Streams the rendered MP4 from the provider to the browser and stops there.
 * Nothing is written to Postgres, Supabase Storage or R2 — video is bulky and
 * the project is not going to warehouse it. The browser is the only copy
 * (IndexedDB, via src/lib/videoStorage.ts), which is also why the UI has to
 * tell people to save clips to their device.
 *
 * This function exists purely so the provider API key never reaches the
 * client; it holds no state of its own.
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
    .select("id, user_id, status, provider_video_id, seconds")
    .eq("id", jobId)
    .single();

  if (error || !job) return json({ error: "Job not found" }, 404);
  if (job.user_id !== user.id) return json({ error: "Forbidden" }, 403);
  if (job.status !== "completed" || !job.provider_video_id) {
    return json({ error: "Video is not ready yet", errorType: "not_ready" }, 409);
  }

  const provider = getVideoProvider();
  if (!provider) return json({ error: "This video is no longer available to download.", errorType: "expired" }, 410);

  const upstream = await provider.fetchContent(job.provider_video_id);

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    console.error(`[video job ${job.id}] content fetch failed ${upstream.status}: ${detail.slice(0, 200)}`);
    // The provider only serves the file for about an hour after the render.
    // Past that, a device that never downloaded it cannot get it back.
    if (upstream.status === 404 || upstream.status === 410) {
      return json({
        error: "This video is no longer available to download. Videos are only retrievable for about an hour after they're made.",
        errorType: "expired",
      }, 410);
    }
    return json({ error: "Could not download the video.", errorType: "provider_error" }, 502);
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "video/mp4",
      "Cache-Control": "no-store",
      "Content-Disposition": `inline; filename="arc-video-${job.id}.mp4"`,
    },
  });
});
