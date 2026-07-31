import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Image, decode } from "https://deno.land/x/imagescript@1.2.17/mod.ts";
import { getVideoProvider, type VideoOrientation } from "../_shared/videoProvider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

/**
 * Product cap, deliberately below what the provider allows. Sora bills
 * $0.10/second, so a 4s clip is $0.40. The provider only accepts 4, 8 or 12 —
 * 4 is the longest option that stays under our 5-second ceiling. Raising this
 * to 8 doubles the per-clip cost; change it here and in the client's
 * VIDEO_DURATION_OPTIONS together.
 */
const MAX_SECONDS = 4;
const DEFAULT_SECONDS = 4;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeOrientation(value: unknown, fallback: VideoOrientation = "landscape"): VideoOrientation {
  return value === "portrait" || value === "landscape" ? value : fallback;
}

/**
 * Map the image picker's aspect ratios onto the only two shapes Sora renders.
 * Square and 3:2 both read better letterboxed into landscape than squeezed
 * into portrait.
 */
function orientationFromAspect(aspect: unknown): VideoOrientation {
  return aspect === "2:3" || aspect === "3:4" || aspect === "9:16" ? "portrait" : "landscape";
}

async function readImageBytes(source: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  if (source.startsWith("data:")) {
    const match = source.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
    if (!match) throw new Error("Invalid image data URL");
    const contentType = match[1] || "image/png";
    const binary = match[2] ? atob(match[3]) : decodeURIComponent(match[3]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { bytes, contentType };
  }
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Failed to fetch source image: ${response.status}`);
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") || "image/png",
  };
}

/**
 * The provider rejects a first frame whose dimensions don't match `size`
 * exactly, and Arc's stills are 1024x1024 / 1536x1024 / 1024x1536 — never
 * 1280x720. Scale to cover, then centre-crop, so the subject survives instead
 * of getting stretched.
 */
async function coverResize(bytes: Uint8Array, targetW: number, targetH: number): Promise<Uint8Array> {
  const decoded = await decode(bytes);
  const img = decoded as Image;
  const scale = Math.max(targetW / img.width, targetH / img.height);
  const scaledW = Math.max(targetW, Math.round(img.width * scale));
  const scaledH = Math.max(targetH, Math.round(img.height * scale));

  const resized = img.resize(scaledW, scaledH);
  const xOffset = Math.max(0, Math.floor((scaledW - targetW) / 2));
  const yOffset = Math.max(0, Math.floor((scaledH - targetH) / 2));
  const cropped = resized.crop(xOffset, yOffset, targetW, targetH);
  return await cropped.encode();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const provider = getVideoProvider();
  if (!provider || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ success: false, error: "Video generation backend is not configured.", errorType: "configuration_error" });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ success: false, error: "You need to be signed in to generate videos.", errorType: "auth_error" });
  }

  const token = authHeader.replace("Bearer ", "");
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return jsonResponse({ success: false, error: "Your session expired. Please sign in again.", errorType: "auth_error" });
  }
  if (user.is_anonymous) {
    return jsonResponse({ success: false, error: "Create an account to generate videos.", errorType: "account_required" });
  }

  let jobId: string | null = null;

  try {
    const body = await req.json();
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      return jsonResponse({ success: false, error: "Prompt is required.", errorType: "invalid_request" });
    }

    const sourceImageUrl = typeof body?.sourceImageUrl === "string" && body.sourceImageUrl.trim()
      ? body.sourceImageUrl.trim()
      : null;
    const mode = sourceImageUrl ? "image" : "text";

    const requestedSeconds = Math.floor(Number(body?.seconds));
    let seconds = Number.isFinite(requestedSeconds) && requestedSeconds > 0 ? requestedSeconds : DEFAULT_SECONDS;
    seconds = Math.min(seconds, MAX_SECONDS);
    if (!provider.allowedSeconds.includes(seconds)) {
      // Snap down to the closest duration the provider will actually accept
      // rather than letting it come back as an opaque 400.
      const options = provider.allowedSeconds.filter((s) => s <= MAX_SECONDS).sort((a, b) => b - a);
      seconds = options[0] ?? provider.allowedSeconds[0];
    }

    const orientation = body?.orientation
      ? normalizeOrientation(body.orientation)
      : orientationFromAspect(body?.aspectRatio);
    const size = provider.sizeFor(orientation);

    const { data: jobData, error: jobError } = await supabaseAdmin
      .from("video_generation_jobs")
      .insert({
        user_id: user.id,
        mode,
        prompt,
        source_image_url: sourceImageUrl,
        seconds,
        size,
        provider: provider.id,
        model: provider.model,
        status: "processing",
        last_attempt_at: new Date().toISOString(),
        attempts: 1,
      })
      .select("id")
      .single();

    if (jobError || !jobData) {
      console.error("Failed to create video job:", jobError);
      return jsonResponse({ success: false, error: "Failed to start video generation.", errorType: "queue_error" });
    }

    jobId = jobData.id;
    const currentJobId = jobData.id;

    // Boost/admin gating and the per-second daily allowance both live in this
    // RPC. Failures return 200 with success:false, matching generate-image —
    // a non-2xx reaches the client as supabase-js's opaque wrapper error.
    const { data: quota, error: quotaError } = await supabaseAdmin.rpc("reserve_video_quota", {
      target_user_id: user.id,
      target_job_id: currentJobId,
      requested_seconds: seconds,
    });

    if (quotaError) {
      console.error("Video quota error:", quotaError);
      await supabaseAdmin.from("video_generation_jobs")
        .update({ status: "failed", error_message: "Could not reserve video quota", error_type: "quota_error" })
        .eq("id", currentJobId);
      return jsonResponse({ success: false, error: "Could not check today's video allowance.", errorType: "quota_error" });
    }

    if (!quota?.allowed) {
      // hasAccess distinguishes "not on the allowlist" from "allowlisted but
      // out of allowance for today".
      const noAccess = quota?.hasAccess === false;
      const message = noAccess
        ? "Video generation is not enabled on this account."
        : `Daily video limit reached. ${quota?.remainingSeconds ?? 0}s of ${quota?.limitSeconds ?? 0}s remaining today.`;
      await supabaseAdmin.from("video_generation_jobs")
        .update({
          status: "failed",
          error_message: message,
          error_type: noAccess ? "not_enabled" : "daily_limit",
        })
        .eq("id", currentJobId);
      return jsonResponse({
        success: false,
        error: message,
        errorType: noAccess ? "not_enabled" : "daily_limit",
        quota,
      });
    }

    // Prepare the first frame, if this is an "animate this image" request.
    let referenceImage: { bytes: Uint8Array; contentType: string } | undefined;
    if (sourceImageUrl) {
      try {
        const [targetW, targetH] = size.split("x").map(Number);
        const original = await readImageBytes(sourceImageUrl);
        referenceImage = {
          bytes: await coverResize(original.bytes, targetW, targetH),
          contentType: "image/png",
        };
      } catch (error) {
        console.error(`[video job ${currentJobId}] reference image prep failed:`, error);
        await supabaseAdmin.from("video_generation_jobs")
          .update({
            status: "failed",
            error_message: "Could not read the image you asked to animate.",
            error_type: "invalid_reference",
          })
          .eq("id", currentJobId);
        await supabaseAdmin.rpc("finalize_video_quota", { target_job_id: currentJobId, succeeded: false });
        return jsonResponse({
          success: false,
          error: "Could not read the image you asked to animate.",
          errorType: "invalid_reference",
        });
      }
    }

    const created = await provider.create({ prompt, seconds, orientation, referenceImage });

    if (!created.ok) {
      console.error(`[video job ${currentJobId}] create failed: ${created.errorType} ${created.debugDetail.slice(0, 240)}`);
      await supabaseAdmin.from("video_generation_jobs")
        .update({ status: "failed", error_message: created.errorMessage, error_type: created.errorType })
        .eq("id", currentJobId);
      await supabaseAdmin.rpc("finalize_video_quota", { target_job_id: currentJobId, succeeded: false });
      return jsonResponse({ success: false, error: created.errorMessage, errorType: created.errorType, jobId: currentJobId });
    }

    // The render itself is not awaited here. video-job-status forwards the
    // client's polling to the provider, so no request or background task has
    // to stay alive for the length of a render.
    await supabaseAdmin.from("video_generation_jobs")
      .update({ provider_video_id: created.providerVideoId })
      .eq("id", currentJobId);

    console.log(`[video job ${currentJobId}] queued ${seconds}s ${size} (${mode}) as ${created.providerVideoId}`);

    return jsonResponse({ success: true, jobId: currentJobId, status: "processing", seconds, size, quota });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in generate-video function:", error);
    if (jobId) {
      await supabaseAdmin.from("video_generation_jobs")
        .update({ status: "failed", error_message: message, error_type: "processing_error" })
        .eq("id", jobId);
      await supabaseAdmin.rpc("finalize_video_quota", { target_job_id: jobId, succeeded: false });
    }
    return jsonResponse({ success: false, error: message, errorType: "processing_error" });
  }
});
