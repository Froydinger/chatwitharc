import { imageConfiguration, imageIdentityConfiguration, imageRequestIdentity, isGoogleImage, ImageModelUnavailableError } from "../_shared/imagePolicy.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { uploadPrivateImage } from "../_shared/privateImageStorage.ts";

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

// New image requests use OpenAI only. The Google adapter remains dormant in
// _shared/arcImageFlash.ts; historical jobs and credit settlement stay intact.
// GPT Image 2.5 accepts custom dimensions in multiples of 16.
function aspectToSize(aspectRatio: string): string {
  if (aspectRatio === "16:9") return "1536x864";
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
  // Landscape is the product default when a caller doesn't specify one.
  return typeof aspectRatio === "string" && aspectRatio.trim() ? aspectRatio.trim() : "3:2";
}

function wantsTransparentBackground(prompt: string): boolean {
  const normalized = prompt.toLowerCase().replace(/[\s_-]+/g, " ");
  return [
    /\btransparent\b/,
    /\b(?:alpha|cutout|cut out|sticker|isolated)\b.*\b(?:background|canvas|subject|object)\b/,
    /\btransparent (?:background|backdrop|canvas|png)\b/,
    /\b(?:background|backdrop|canvas) (?:is |should be )?transparent\b/,
    /\b(?:with|on) (?:an? )?(?:actual(?:ly)? |fully )?transparent background\b/,
    /\bno (?:background|backdrop)\b/,
    /\bremove (?:the )?(?:background|backdrop)\b/,
    /\bcut ?out (?:with|on) (?:an? )?transparent background\b/,
    /\btransparent alpha\b/,
  ].some((pattern) => pattern.test(normalized));
}

function addTransparentOutputInstruction(prompt: string): string {
  if (!wantsTransparentBackground(prompt)) return prompt;
  return `${prompt}\n\nOUTPUT REQUIREMENT: Return a true transparent alpha channel. Do not draw, simulate, or include a checkerboard transparency grid, white matte, colored matte, or any background pixels outside the subject.`;
}

async function updateJob(supabase: any, jobId: string, values: Record<string, unknown>) {
  const { error } = await supabase.from("image_generation_jobs").update(values as any).eq("id", jobId);
  if (error) console.error("Failed to update image job:", jobId, error);
}

async function callImageGatewaySingle(prompt: string, model: string, size: string, quality: string) {
  const transparent = wantsTransparentBackground(prompt);
  const requestBody = JSON.stringify({
    model,
    prompt,
    size,
    quality,
    n: 1,
    ...(transparent ? { background: "transparent", output_format: "png" } : {}),
  });

  for (let attempt = 0; attempt < 1; attempt++) {
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

async function callImageGateway(prompt: string, model: string, size: string, count: number, quality: string) {
  if (count <= 1) {
    return callImageGatewaySingle(prompt, model, size, quality);
  }

  // Issue parallel requests for count > 1 to avoid serial OpenAI 60s+ gateway timeouts
  const results = await Promise.all(
    Array.from({ length: count }, () => callImageGatewaySingle(prompt, model, size, quality))
  );

  const successful = results.filter((r) => r.ok);
  if (successful.length > 0) {
    const combinedData: any[] = [];
    for (const res of successful) {
      try {
        const parsed = JSON.parse(res.rawText);
        if (Array.isArray(parsed?.data)) {
          combinedData.push(...parsed.data);
        }
      } catch {
        // Failed to parse response chunk; skip
      }
    }
    return {
      ok: true,
      status: 200,
      rawText: JSON.stringify({ data: combinedData }),
    };
  }

  return results[0];
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


/**
 * Runs the actual generation off the request path. The edge runtime kills a
 * request long before our 180s client timeout can fire, so anything slow —
 * n=3, medium quality — used to die as an opaque non-2xx. This
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
  aspectRatio: string,
  quality: string,
  fallbackModel: string | null,
) {
  try {
    console.log(`[job ${jobId}] generating ${count} image(s) with ${selectedModel} (${size}, ${quality})`);
    const result = await callImageGateway(prompt, selectedModel, size, count, quality);
    const finalModel = selectedModel;

    if (!result.ok) {
      const errorInfo = classifyError(result.status, result.rawText);
      console.error(`[job ${jobId}] image gen failed: ${errorInfo.errorType} (${result.status}) ${errorInfo.debugDetail.slice(0, 240)}`);
      await updateJob(supabaseAdmin, jobId, { status: "failed", error_message: errorInfo.errorMessage, error_type: errorInfo.errorType });
      await supabaseAdmin.rpc("finalize_arc_image_credits", { target_job_id: jobId, successful_count: 0 });
      return;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(result.rawText);
    } catch {
      await updateJob(supabaseAdmin, jobId, { status: "failed", error_message: "Failed to parse model response", error_type: "parse_error" });
      await supabaseAdmin.rpc("finalize_arc_image_credits", { target_job_id: jobId, successful_count: 0 });
      return;
    }

    const imageUrls = extractImageUrls(parsed);
    if (imageUrls.length === 0) {
      await updateJob(supabaseAdmin, jobId, { status: "failed", error_message: "No image returned from model", error_type: "no_image_returned" });
      await supabaseAdmin.rpc("finalize_arc_image_credits", { target_job_id: jobId, successful_count: 0 });
      return;
    }

    // A failed upload must not lose the whole batch — keep whatever landed.
    const uploads = await Promise.allSettled(
      imageUrls.map((url) => uploadPrivateImage(supabaseAdmin, url, { userId, kind: "generated" })),
    );
    const persistedImageUrls = uploads
      .filter((u): u is PromiseFulfilledResult<string> => u.status === "fulfilled")
      .map((u) => u.value);
    const failedUploads = uploads.length - persistedImageUrls.length;
    if (failedUploads > 0) console.error(`[job ${jobId}] ${failedUploads} private image upload(s) failed`);

    if (persistedImageUrls.length === 0) {
      await updateJob(supabaseAdmin, jobId, { status: "failed", error_message: "Generated image could not be stored. Please try again.", error_type: "storage_error" });
      await supabaseAdmin.rpc("finalize_arc_image_credits", { target_job_id: jobId, successful_count: 0 });
      return;
    }

    console.log(`[job ${jobId}] completed (${persistedImageUrls.length} image${persistedImageUrls.length === 1 ? "" : "s"})`);
    await updateJob(supabaseAdmin, jobId, {
      status: "completed",
      result_image_url: persistedImageUrls[0],
      result_image_urls: persistedImageUrls,
      preferred_model: finalModel,
      fallback_model: fallbackModel,
      error_message: null,
      error_type: null,
    });
    await supabaseAdmin.rpc("finalize_arc_image_credits", { target_job_id: jobId, successful_count: persistedImageUrls.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[job ${jobId}] processing error:`, error);
    await updateJob(supabaseAdmin, jobId, { status: "failed", error_message: message, error_type: "processing_error" });
    await supabaseAdmin.rpc("finalize_arc_image_credits", { target_job_id: jobId, successful_count: 0 });
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
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
    const { data: policy, error: policyError } = await supabaseAdmin.rpc("arc_image_snapshot", { u: user.id });
    if (policyError || !policy) throw new Error("Image policy unavailable");
    const config = imageConfiguration(body?.preferredModel, body?.quality, policy.tier, aspectToSize(aspectRatio));
    const selectedModel = config.model;
    const fallbackModel = typeof body?.preferredModel === "string" && isGoogleImage(body.preferredModel) ? selectedModel : null;
    const size = config.size;
    if (!OPENAI_API_KEY) {
      return jsonResponse({ success: false, error: "The selected image mode is unavailable.", errorType: "configuration_error" });
    }
    const requestedCount = Number(body?.count);
    const count = Number.isFinite(requestedCount)
      ? Math.max(1, Math.min(3, Math.floor(requestedCount)))
      : 1;

    const prompt = addTransparentOutputInstruction(rawPrompt);

    if (!rawPrompt) {
      return jsonResponse({ success: false, error: "Prompt is required.", errorType: "invalid_request" });
    }

    const identity = await imageRequestIdentity(body?.requestKey, { rawPrompt, aspectRatio, config: imageIdentityConfiguration(body?.preferredModel, config), count });
    const { data: jobData, error: jobError } = await supabaseAdmin
      .from("image_generation_jobs")
      .upsert({
        user_id: user.id,
        image_request_key: identity.key,
        image_request_hash: identity.hash,
        job_type: "generate",
        prompt: rawPrompt,
        aspect_ratio: aspectRatio,
        preferred_model: selectedModel,
        fallback_model: fallbackModel,
        image_quality: config.quality,
        image_size: config.size,
        status: "processing",
        last_attempt_at: new Date().toISOString(),
        attempts: 1,
      }, { onConflict: "user_id,image_request_key", ignoreDuplicates: true })
      .select("id")
      .maybeSingle();

    if (!jobError && !jobData) {
      const { data: existing, error } = await supabaseAdmin.from('image_generation_jobs').select('id,image_request_hash,preferred_model,fallback_model').eq('user_id',user.id).eq('image_request_key',identity.key).single();
      if (error || existing?.image_request_hash !== identity.hash) throw new Error('Image request conflict');
      return jsonResponse({ success: true, jobId: existing.id, status: 'pending', preferredModel: existing.preferred_model, fallbackModel: existing.fallback_model ?? null });
    }
    if (jobError || !jobData) {
      console.error("Failed to create image job:", jobError);
      return jsonResponse({ success: false, error: "Failed to start image generation.", errorType: "queue_error" });
    }

    jobId = jobData.id;
    const currentJobId = jobData.id;

    const { data: quota, error: quotaError } = await supabaseAdmin.rpc("reserve_arc_image_credits", {
      target_user_id: user.id,
      target_job_id: currentJobId,
      requested_count: count,
    });
    // These return 200 with success:false — like every other failure path in
    // this function. A non-2xx would reach the client as supabase-js's opaque
    // "Edge Function returned a non-2xx status code" and bury the real reason.
    if (quotaError) {
      await updateJob(supabaseAdmin, currentJobId, { status: "failed", error_message: "Could not reserve image quota", error_type: "quota_error" });
      return jsonResponse({ success: false, error: "Could not check your monthly image allowance.", errorType: "quota_error" });
    }
    if (!quota?.allowed) {
      await updateJob(supabaseAdmin, currentJobId, { status: "failed", error_message: "Free image limit reached", error_type: "daily_limit" });
      return jsonResponse({
        success: false,
        error: quota?.error || "Monthly image allowance reached.",
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
      aspectRatio,
      config.quality,
      fallbackModel,
    );
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      EdgeRuntime.waitUntil(task);
    } else {
      // Local/dev runtime without waitUntil — don't leave it unhandled.
      task.catch((e) => console.error("Background generate job failed:", e));
    }

    return jsonResponse({ jobId: currentJobId, status: "pending", success: true, quota, preferredModel: selectedModel, fallbackModel });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (error instanceof ImageModelUnavailableError) {
      return jsonResponse({ success: false, error: message, errorType: "model_unavailable" });
    }
    console.error("Error in generate-image function:", error);
    if (jobId) {
      await updateJob(supabaseAdmin, jobId, { status: "failed", error_message: message, error_type: "processing_error" });
      await supabaseAdmin.rpc("finalize_arc_image_credits", { target_job_id: jobId, successful_count: 0 });
    }
    return jsonResponse({ success: false, error: message, errorType: "processing_error", fallback: true });
  }
});
