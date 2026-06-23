import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Image, decode } from "https://deno.land/x/imagescript@1.2.17/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const REQUEST_TIMEOUT_MS = 55_000;
const RETRY_DELAY_MS = 3_000;

// All image generation is locked to OpenAI GPT-Image-2 at medium quality.
const DEFAULT_IMAGE_MODEL = "openai/gpt-image-2";
const ALLOWED_IMAGE_MODELS = new Set<string>(["openai/gpt-image-2"]);
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

async function callImageGateway(prompt: string, model: string, size: string) {
  const requestBody = JSON.stringify({
    model,
    prompt,
    size,
    quality: "medium",
    n: 1,
  });

  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
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

function extractImageUrl(parsed: any): string | null {
  const item = parsed?.data?.[0];
  if (!item) return null;
  if (typeof item.url === "string" && item.url) return item.url;
  if (typeof item.b64_json === "string" && item.b64_json) {
    return `data:image/png;base64,${item.b64_json}`;
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!LOVABLE_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ success: false, error: "Image generation backend is not configured.", errorType: "configuration_error" });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ error: "Missing authorization header" }, 401);

  const token = authHeader.replace("Bearer ", "");
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return jsonResponse({ error: "Invalid or expired token" }, 401);

  let jobId: string | null = null;

  try {
    const body = await req.json();
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    const aspectRatio = normalizeAspectRatio(body?.aspectRatio);
    const selectedModel = pickImageModel(body?.preferredModel);
    const size = aspectToSize(aspectRatio);

    if (!prompt) {
      return jsonResponse({ success: false, error: "Prompt is required.", errorType: "invalid_request" }, 400);
    }

    const { data: jobData, error: jobError } = await supabaseAdmin
      .from("image_generation_jobs")
      .insert({
        user_id: user.id,
        job_type: "generate",
        prompt,
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

    console.log(`Generating image with ${selectedModel} (${size}, medium) for job ${currentJobId}`);
    const result = await callImageGateway(prompt, selectedModel, size);

    if (!result.ok) {
      const errorInfo = classifyError(result.status, result.rawText);
      console.log(`Image gen failed: ${errorInfo.errorType} (${result.status})`);
      await updateJob(supabaseAdmin, currentJobId, { status: "failed", error_message: errorInfo.errorMessage, error_type: errorInfo.errorType });
      return jsonResponse({
        jobId: currentJobId,
        status: "failed",
        success: false,
        error: errorInfo.errorMessage,
        errorType: errorInfo.errorType,
        debugDetail: errorInfo.debugDetail,
        fallback: result.status >= 500 || result.status === 408,
      });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(result.rawText);
    } catch {
      await updateJob(supabaseAdmin, currentJobId, { status: "failed", error_message: "Failed to parse model response", error_type: "parse_error" });
      return jsonResponse({ jobId: currentJobId, status: "failed", success: false, error: "Failed to parse model response", errorType: "parse_error", debugDetail: result.rawText.slice(0, 200) });
    }

    const imageUrl = extractImageUrl(parsed);
    if (!imageUrl) {
      await updateJob(supabaseAdmin, currentJobId, { status: "failed", error_message: "No image returned from model", error_type: "no_image_returned" });
      return jsonResponse({ jobId: currentJobId, status: "failed", success: false, error: "No image returned from model", errorType: "no_image_returned", debugDetail: result.rawText.slice(0, 500) });
    }

    console.log(`Image generated successfully for job ${currentJobId}`);
    await updateJob(supabaseAdmin, currentJobId, { status: "completed", result_image_url: imageUrl, error_message: null, error_type: null });
    return jsonResponse({ jobId: currentJobId, status: "completed", success: true, imageUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in generate-image function:", error);
    if (jobId) await updateJob(supabaseAdmin, jobId, { status: "failed", error_message: message, error_type: "processing_error" });
    return jsonResponse({ success: false, error: message, errorType: "processing_error", fallback: true });
  }
});
