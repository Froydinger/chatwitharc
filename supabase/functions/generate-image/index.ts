import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Image, decode } from "https://deno.land/x/imagescript@1.2.17/mod.ts";
import { uploadImageToR2 } from "../_shared/r2.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const REQUEST_TIMEOUT_MS = 180_000;
const RETRY_DELAY_MS = 3_000;

// Default all image generation to Image 2. Voice also requests this explicitly.
const DEFAULT_IMAGE_MODEL = "gpt-image-2";
const ALLOWED_IMAGE_MODELS = new Set<string>(["gpt-image-1", "gpt-image-1-mini", "gpt-image-1.5-flash", "gpt-image-2"]);
function pickImageModel(requested?: unknown): string {
  return typeof requested === "string" && ALLOWED_IMAGE_MODELS.has(requested)
    ? requested
    : DEFAULT_IMAGE_MODEL;
}

// GPT-Image-2 only supports a fixed set of sizes. Map the user's aspect ratio
// to the closest supported size.
function aspectToSize(aspectRatio: string): string {
  const ratios: Record<string, "square" | "landscape" | "portrait"> = {
    "1:1": "square",
    "3:2": "landscape",
    "4:3": "landscape",
    "16:9": "landscape",
    "21:9": "landscape",
    "2:3": "portrait",
    "3:4": "portrait",
    "9:16": "portrait",
  };
  const kind = ratios[aspectRatio] || "square";
  if (kind === "square") return "1024x1024";
  if (kind === "portrait") return "1024x1536";
  return "1536x1024";
}

type ErrorInfo = {
  errorType: string;
  errorMessage: string;
  debugDetail: string;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function classifyError(status: number, rawText: string): ErrorInfo {
  let debugDetail = rawText || "Unknown image generation error";
  let errorType = "unknown";
  let errorMessage = "Image generation failed. Please try again.";

  try {
    const json = JSON.parse(rawText);
    const detail = json.error?.message || json.message || json.error || rawText;
    debugDetail = typeof detail === "string" ? detail : JSON.stringify(detail);

    const lower = debugDetail.toLowerCase();
    if (
      lower.includes("safety") ||
      lower.includes("content policy") ||
      lower.includes("blocked") ||
      lower.includes("content violation") ||
      lower.includes("responsible ai")
    ) {
      return {
        errorType: "content_violation",
        errorMessage: "Blocked by content safety filters. Try rephrasing your prompt.",
        debugDetail,
      };
    }

    if (lower.includes("invalid_argument") || lower.includes("invalid argument")) {
      return {
        errorType: "invalid_request",
        errorMessage: `Invalid request: ${debugDetail.slice(0, 200)}`,
        debugDetail,
      };
    }
  } catch {
    // Raw text is not JSON
  }

  if (status === 408) {
    errorType = "timeout";
    errorMessage = "Image generation timed out. Please try again.";
  } else if (status === 429) {
    errorType = "rate_limit";
    errorMessage = "Too many image requests. Please wait a moment and try again.";
  } else if (status === 402) {
    errorType = "payment_required";
    errorMessage = "Image generation credits exhausted. Please add credits.";
  } else if (status === 400) {
    errorType = "invalid_request";
    errorMessage = `Invalid request: ${debugDetail.slice(0, 200)}`;
  } else if (status >= 500) {
    errorType = "provider_error";
    errorMessage = `Image model error: ${debugDetail.slice(0, 200)}`;
  }

  return { errorType, errorMessage, debugDetail };
}

function normalizeAspectRatio(aspectRatio?: unknown) {
  return typeof aspectRatio === "string" && aspectRatio.trim() ? aspectRatio.trim() : "1:1";
}

async function updateJob(supabase: any, jobId: string, values: Record<string, unknown>) {
  const { error } = await supabase.from("image_generation_jobs").update(values as any).eq("id", jobId);
  if (error) console.error("Failed to update image job:", jobId, error);
}

async function callImageGateway(prompt: string, model: string, size: string, count: number) {
  const requestBody = JSON.stringify({
    model,
    prompt,
    size,
    quality: "medium",
    n: count,
  });

  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: requestBody,
        signal: controller.signal,
      });

      const rawText = await response.text();
      clearTimeout(timeoutId);

      if (response.status === 429 && attempt === 0) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }

      return { ok: response.ok, status: response.status, rawText };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === "AbortError") {
        return { ok: false, status: 408, rawText: "Request timeout" };
      }
      return { ok: false, status: 500, rawText: error instanceof Error ? error.message : "Unknown fetch error" };
    }
  }

  return { ok: false, status: 429, rawText: "Rate limit retry failed" };
}

function extractImageUrls(parsed: any): string[] {
  const items = Array.isArray(parsed?.data) ? parsed.data : [];
  const urls: string[] = [];
  for (const item of items) {
    if (typeof item?.url === "string" && item.url) urls.push(item.url);
    else if (typeof item?.b64_json === "string" && item.b64_json) {
      urls.push(`data:image/png;base64,${item.b64_json}`);
    }
  }
  return urls;
}


// Crop a 3:2 (1536x1024) image to true 16:9 (1536x864) by removing equal
// horizontal slices from top and bottom. Accepts a data URL or http URL,
// returns a data URL of the cropped PNG.
async function cropTo16x9(imageUrl: string): Promise<string> {
  let bytes: Uint8Array;
  if (imageUrl.startsWith("data:")) {
    const commaIdx = imageUrl.indexOf(",");
    const b64 = imageUrl.slice(commaIdx + 1);
    const bin = atob(b64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } else {
    const res = await fetch(imageUrl);
    bytes = new Uint8Array(await res.arrayBuffer());
  }

  const decoded = await decode(bytes);
  const img = decoded as Image;
  const w = img.width;
  const h = img.height;
  const targetH = Math.round((w * 9) / 16);
  if (targetH >= h) return imageUrl; // already 16:9 or wider
  const yOffset = Math.floor((h - targetH) / 2);
  const cropped = img.crop(0, yOffset, w, targetH);
  const out = await cropped.encode();
  // Encode to base64
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < out.length; i += chunk) {
    binary += String.fromCharCode(...out.subarray(i, i + chunk));
  }
  return `data:image/png;base64,${btoa(binary)}`;
}

/**
 * Runs the actual generation off the request path. The edge runtime kills a
 * request long before our 180s client timeout can fire, so anything slow —
 * n=3, medium quality, a 16:9 crop — used to die as an opaque non-2xx. This
 * mirrors the background-job pattern edit-image already uses: the handler
 * returns a jobId immediately and the client polls image-job-status.
 */
async function processGenerateJob(
  supabaseAdmin: any,
  jobId: string,
  userId: string,
  prompt: string,
  selectedModel: string,
  size: string,
  count: number,
  isYouTube: boolean,
) {
  try {
    console.log(`[job ${jobId}] generating ${count} image(s) with ${selectedModel} (${size}, medium${isYouTube ? ", 16:9 crop" : ""})`);
    let result = await callImageGateway(prompt, selectedModel, size, count);
    let finalModel = selectedModel;

    if (!result.ok && selectedModel === "gpt-image-1.5-flash") {
      const errorInfo = classifyError(result.status, result.rawText);
      const canFallback = errorInfo.errorType === "provider_error" || errorInfo.errorType === "timeout" || errorInfo.errorType === "invalid_request";
      if (canFallback) {
        console.warn(`[job ${jobId}] voice flash model failed (${result.status}); falling back to ${DEFAULT_IMAGE_MODEL}`);
        finalModel = DEFAULT_IMAGE_MODEL;
        result = await callImageGateway(prompt, finalModel, size, count);
      }
    }

    // Any non-flash model that hit a transient provider error or timeout gets
    // one retry on the default model before we give up on the job.
    if (!result.ok && finalModel !== DEFAULT_IMAGE_MODEL && selectedModel !== "gpt-image-1.5-flash") {
      const errorInfo = classifyError(result.status, result.rawText);
      if (errorInfo.errorType === "provider_error" || errorInfo.errorType === "timeout") {
        console.warn(`[job ${jobId}] ${finalModel} failed (${result.status}); retrying on ${DEFAULT_IMAGE_MODEL}`);
        const retry = await callImageGateway(prompt, DEFAULT_IMAGE_MODEL, size, count);
        if (retry.ok) {
          result = retry;
          finalModel = DEFAULT_IMAGE_MODEL;
        }
      }
    }

    if (!result.ok) {
      const errorInfo = classifyError(result.status, result.rawText);
      console.error(`[job ${jobId}] image gen failed: ${errorInfo.errorType} (${result.status}) ${errorInfo.debugDetail.slice(0, 240)}`);
      await updateJob(supabaseAdmin, jobId, { status: "failed", error_message: errorInfo.errorMessage, error_type: errorInfo.errorType });
      await supabaseAdmin.rpc("finalize_image_quota", { target_job_id: jobId, successful_count: 0 });
      return;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(result.rawText);
    } catch {
      await updateJob(supabaseAdmin, jobId, { status: "failed", error_message: "Failed to parse model response", error_type: "parse_error" });
      await supabaseAdmin.rpc("finalize_image_quota", { target_job_id: jobId, successful_count: 0 });
      return;
    }

    let imageUrls = extractImageUrls(parsed);
    if (imageUrls.length === 0) {
      await updateJob(supabaseAdmin, jobId, { status: "failed", error_message: "No image returned from model", error_type: "no_image_returned" });
      await supabaseAdmin.rpc("finalize_image_quota", { target_job_id: jobId, successful_count: 0 });
      return;
    }

    if (isYouTube) {
      imageUrls = await Promise.all(
        imageUrls.map(async (u) => {
          try { return await cropTo16x9(u); } catch (e) { console.error(`[job ${jobId}] 16:9 crop failed:`, e); return u; }
        })
      );
    }

    // A failed R2 upload must not lose the whole batch — keep whatever landed.
    const uploads = await Promise.allSettled(
      imageUrls.map((url, index) => uploadImageToR2(url, { userId, kind: "generated", index })),
    );
    const persistedImageUrls = uploads
      .filter((u): u is PromiseFulfilledResult<string> => u.status === "fulfilled")
      .map((u) => u.value);
    const failedUploads = uploads.length - persistedImageUrls.length;
    if (failedUploads > 0) console.error(`[job ${jobId}] ${failedUploads} R2 upload(s) failed`);

    if (persistedImageUrls.length === 0) {
      await updateJob(supabaseAdmin, jobId, { status: "failed", error_message: "Generated image could not be stored. Please try again.", error_type: "storage_error" });
      await supabaseAdmin.rpc("finalize_image_quota", { target_job_id: jobId, successful_count: 0 });
      return;
    }

    console.log(`[job ${jobId}] completed (${persistedImageUrls.length} image${persistedImageUrls.length === 1 ? "" : "s"})`);
    await updateJob(supabaseAdmin, jobId, {
      status: "completed",
      result_image_url: persistedImageUrls[0],
      result_image_urls: persistedImageUrls,
      preferred_model: finalModel,
      fallback_model: finalModel !== selectedModel ? finalModel : null,
      error_message: null,
      error_type: null,
    });
    await supabaseAdmin.rpc("finalize_image_quota", { target_job_id: jobId, successful_count: persistedImageUrls.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[job ${jobId}] processing error:`, error);
    await updateJob(supabaseAdmin, jobId, { status: "failed", error_message: message, error_type: "processing_error" });
    await supabaseAdmin.rpc("finalize_image_quota", { target_job_id: jobId, successful_count: 0 });
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ success: false, error: "Image generation backend is not configured.", errorType: "configuration_error" });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ success: false, error: "You need to be signed in to generate images.", errorType: "auth_error" });
  }

  const token = authHeader.replace("Bearer ", "");
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return jsonResponse({ success: false, error: "Your session expired. Please sign in again.", errorType: "auth_error" });
  }
  if (user.is_anonymous) {
    return jsonResponse({
      success: false,
      error: "Create a free account to generate images.",
      errorType: "account_required",
    });
  }

  let jobId: string | null = null;

  try {
    const body = await req.json();
    const rawPrompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    const aspectRatio = normalizeAspectRatio(body?.aspectRatio);
    const selectedModel = pickImageModel(body?.preferredModel);
    const size = aspectToSize(aspectRatio);
    const isYouTube = aspectRatio === "16:9";
    const requestedCount = Number(body?.count);
    const count = Number.isFinite(requestedCount)
      ? Math.max(1, Math.min(3, Math.floor(requestedCount)))
      : 1;

    const prompt = isYouTube
      ? `${rawPrompt}\n\nIMPORTANT COMPOSITION RULE: Render this as a 16:9 widescreen image. The full canvas is 1536x1024, but place ALL meaningful content within the centered 1536x864 region. Add solid pure black (#000000) letterbox bars exactly 80 pixels tall at the very top and very bottom of the image. The black bars must be uniformly solid black, edge-to-edge, with no gradients, textures, or content. Treat them as off-screen padding.`
      : rawPrompt;

    if (!rawPrompt) {
      return jsonResponse({ success: false, error: "Prompt is required.", errorType: "invalid_request" });
    }

    const { data: jobData, error: jobError } = await supabaseAdmin
      .from("image_generation_jobs")
      .insert({
        user_id: user.id,
        job_type: "generate",
        prompt: rawPrompt,
        aspect_ratio: aspectRatio,
        preferred_model: selectedModel,
        status: "processing",
        last_attempt_at: new Date().toISOString(),
        attempts: 1,
      })
      .select("id")
      .single();

    if (jobError || !jobData) {
      console.error("Failed to create image job:", jobError);
      return jsonResponse({ success: false, error: "Failed to start image generation.", errorType: "queue_error" });
    }

    jobId = jobData.id;
    const currentJobId = jobData.id;

    const { data: quota, error: quotaError } = await supabaseAdmin.rpc("reserve_image_quota", {
      target_user_id: user.id,
      target_job_id: currentJobId,
      requested_count: count,
    });
    // These return 200 with success:false — like every other failure path in
    // this function. A non-2xx would reach the client as supabase-js's opaque
    // "Edge Function returned a non-2xx status code" and bury the real reason.
    if (quotaError) {
      await updateJob(supabaseAdmin, currentJobId, { status: "failed", error_message: "Could not reserve image quota", error_type: "quota_error" });
      return jsonResponse({ success: false, error: "Could not check today's image allowance.", errorType: "quota_error" });
    }
    if (!quota?.allowed) {
      await updateJob(supabaseAdmin, currentJobId, { status: "failed", error_message: "Daily image limit reached", error_type: "daily_limit" });
      return jsonResponse({
        success: false,
        error: `Daily image limit reached. ${quota?.remaining ?? 0} of 20 remaining.`,
        errorType: "daily_limit",
        quota,
      });
    }

    // Kick off processing in the background and respond immediately, so a slow
    // generation can never be killed mid-flight by the edge runtime.
    const task = processGenerateJob(
      supabaseAdmin,
      currentJobId,
      user.id,
      prompt,
      selectedModel,
      size,
      count,
      isYouTube,
    );
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      EdgeRuntime.waitUntil(task);
    } else {
      // Local/dev runtime without waitUntil — don't leave it unhandled.
      task.catch((e) => console.error("Background generate job failed:", e));
    }

    return jsonResponse({ jobId: currentJobId, status: "pending", success: true, quota });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in generate-image function:", error);
    if (jobId) {
      await updateJob(supabaseAdmin, jobId, { status: "failed", error_message: message, error_type: "processing_error" });
      await supabaseAdmin.rpc("finalize_image_quota", { target_job_id: jobId, successful_count: 0 });
    }
    return jsonResponse({ success: false, error: message, errorType: "processing_error", fallback: true });
  }
});
