import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const REQUEST_TIMEOUT_MS = 55_000;
const RETRY_DELAY_MS = 3_000;

const MODEL_FALLBACK_CHAIN = [
  "google/gemini-3.1-flash-image-preview",
  "google/gemini-3-pro-image-preview",
  "google/gemini-2.5-flash-image",
];

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

function isRetryableFailure(status: number, rawText: string): boolean {
  // Don't retry content violations, invalid input, payment issues
  if (status === 400 || status === 402 || status === 403) return false;
  const lower = rawText.toLowerCase();
  if (lower.includes("safety") || lower.includes("content policy") || lower.includes("blocked") || lower.includes("responsible ai") || lower.includes("content violation")) return false;
  // Retry on 5xx, 408, 429, and known error codes like 1102
  return status >= 500 || status === 408 || status === 429 || lower.includes("1102");
}

function normalizeAspectRatio(aspectRatio?: unknown) {
  return typeof aspectRatio === "string" && aspectRatio.trim() ? aspectRatio.trim() : "1:1";
}

function buildImagePrompt(prompt: string, aspectRatio: string) {
  const cleanedPrompt = prompt.replace(/^generate an image:\s*/i, "").trim();
  return `Generate an image in ${aspectRatio} aspect ratio: ${cleanedPrompt}`;
}

async function updateJob(supabase: any, jobId: string, values: Record<string, unknown>) {
  const { error } = await supabase.from("image_generation_jobs").update(values as any).eq("id", jobId);
  if (error) console.error("Failed to update image job:", jobId, error);
}

async function callImageGateway(prompt: string, model: string) {
  const requestBody = JSON.stringify({
    model,
    messages: [{ role: "user", content: prompt }],
    modalities: ["image", "text"],
  });

  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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

function buildFallbackChain(preferredModel?: string): string[] {
  // Start with preferred model, then append remaining models in order
  const chain = [...MODEL_FALLBACK_CHAIN];
  if (preferredModel && !chain.includes(preferredModel)) {
    chain.unshift(preferredModel);
  } else if (preferredModel && chain.includes(preferredModel)) {
    // Move preferred to front
    const idx = chain.indexOf(preferredModel);
    chain.splice(idx, 1);
    chain.unshift(preferredModel);
  }
  return chain;
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
    const preferredModel = typeof body?.preferredModel === "string" ? body.preferredModel : undefined;

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
        preferred_model: preferredModel || MODEL_FALLBACK_CHAIN[0],
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
    const fallbackChain = buildFallbackChain(preferredModel);
    const imagePrompt = buildImagePrompt(prompt, aspectRatio);

    let lastError: ErrorInfo | null = null;
    let lastStatus = 500;

    for (const model of fallbackChain) {
      console.log(`Trying model ${model} for job ${currentJobId}`);
      const result = await callImageGateway(imagePrompt, model);

      if (!result.ok) {
        const errorInfo = classifyError(result.status, result.rawText);
        console.log(`Model ${model} failed: ${errorInfo.errorType} (${result.status})`);

        if (!isRetryableFailure(result.status, result.rawText)) {
          // Non-retryable error — return immediately
          await updateJob(supabaseAdmin, currentJobId, { status: "failed", error_message: errorInfo.errorMessage, error_type: errorInfo.errorType });
          return jsonResponse({ jobId: currentJobId, status: "failed", success: false, error: errorInfo.errorMessage, errorType: errorInfo.errorType, debugDetail: errorInfo.debugDetail });
        }

        lastError = errorInfo;
        lastStatus = result.status;
        continue; // Try next model
      }

      if (!result.rawText.trim()) {
        console.log(`Model ${model} returned empty response, trying next`);
        lastError = { errorType: "empty_response", errorMessage: "Empty response from model", debugDetail: "Empty response" };
        continue;
      }

      let parsed: any;
      try {
        parsed = JSON.parse(result.rawText);
      } catch {
        console.log(`Model ${model} returned unparseable response, trying next`);
        lastError = { errorType: "parse_error", errorMessage: "Failed to parse model response", debugDetail: result.rawText.slice(0, 200) };
        continue;
      }

      const imageUrl = parsed?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      if (!imageUrl) {
        console.log(`Model ${model} returned no image, trying next`);
        lastError = { errorType: "no_image_returned", errorMessage: "No image returned from model", debugDetail: result.rawText.slice(0, 500) };
        continue;
      }

      // Success!
      console.log(`Image generated successfully with model ${model} for job ${currentJobId}`);
      await updateJob(supabaseAdmin, currentJobId, { status: "completed", result_image_url: imageUrl, error_message: null, error_type: null });
      return jsonResponse({ jobId: currentJobId, status: "completed", success: true, imageUrl });
    }

    // All models exhausted
    await updateJob(supabaseAdmin, currentJobId, {
      status: "failed",
      error_message: lastError?.errorMessage || "All models failed",
      error_type: lastError?.errorType || "all_models_failed",
    });

    return jsonResponse({
      jobId: currentJobId,
      status: "failed",
      success: false,
      error: lastError?.errorMessage || "All image models failed",
      errorType: lastError?.errorType || "all_models_failed",
      debugDetail: lastError?.debugDetail,
      fallback: lastStatus >= 500 || lastStatus === 408,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in generate-image function:", error);
    if (jobId) await updateJob(supabaseAdmin, jobId, { status: "failed", error_message: message, error_type: "processing_error" });
    return jsonResponse({ success: false, error: message, errorType: "processing_error", fallback: true });
  }
});
