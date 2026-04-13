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
const DEFAULT_IMAGE_MODEL = "google/gemini-3.1-flash-image-preview";
const REQUEST_TIMEOUT_MS = 55_000;
const RETRY_DELAY_MS = 3_000;
const ALLOWED_IMAGE_MODELS = new Set([
  "google/gemini-2.5-flash-image",
  "google/gemini-3.1-flash-image-preview",
  "google/gemini-3-pro-image-preview",
]);

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
    // Raw text is not JSON; keep original text as debug detail.
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

function normalizeModel(preferredModel?: unknown) {
  if (typeof preferredModel === "string" && ALLOWED_IMAGE_MODELS.has(preferredModel)) {
    return preferredModel;
  }
  return DEFAULT_IMAGE_MODEL;
}

function normalizeAspectRatio(aspectRatio?: unknown) {
  return typeof aspectRatio === "string" && aspectRatio.trim() ? aspectRatio.trim() : "1:1";
}

function buildImagePrompt(prompt: string, aspectRatio: string) {
  const cleanedPrompt = prompt.replace(/^generate an image:\s*/i, "").trim();
  return `Generate an image in ${aspectRatio} aspect ratio: ${cleanedPrompt}`;
}

async function updateJob(
  supabase: any,
  jobId: string,
  values: Record<string, unknown>,
) {
  const { error } = await supabase.from("image_generation_jobs").update(values as any).eq("id", jobId);
  if (error) {
    console.error("Failed to update image job:", jobId, error);
  }
}

async function callImageGateway(prompt: string, model: string) {
  const requestBody = JSON.stringify({
    model,
    messages: [{ role: "user", content: prompt }],
    modalities: ["image", "text"],
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
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
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        continue;
      }

      return { ok: response.ok, status: response.status, rawText };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === "AbortError") {
        return { ok: false, status: 408, rawText: "Request timeout" };
      }

      const message = error instanceof Error ? error.message : "Unknown fetch error";
      return { ok: false, status: 500, rawText: message };
    }
  }

  return { ok: false, status: 429, rawText: "Rate limit retry failed" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!LOVABLE_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({
      success: false,
      error: "Image generation backend is not configured.",
      errorType: "configuration_error",
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Missing authorization header" }, 401);
  }

  const token = authHeader.replace("Bearer ", "");
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    return jsonResponse({ error: "Invalid or expired token" }, 401);
  }

  let jobId: string | null = null;

  try {
    const body = await req.json();
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    const aspectRatio = normalizeAspectRatio(body?.aspectRatio);
    const imageModel = normalizeModel(body?.preferredModel);

    if (!prompt) {
      return jsonResponse({
        success: false,
        error: "Prompt is required.",
        errorType: "invalid_request",
      }, 400);
    }

    const { data: jobData, error: jobError } = await supabaseAdmin
      .from("image_generation_jobs")
      .insert({
        user_id: user.id,
        job_type: "generate",
        prompt,
        aspect_ratio: aspectRatio,
        preferred_model: imageModel,
        status: "processing",
        last_attempt_at: new Date().toISOString(),
        attempts: 1,
      })
      .select("id")
      .single();

    if (jobError || !jobData) {
      console.error("Failed to create image job:", jobError);
      return jsonResponse({
        success: false,
        error: "Failed to start image generation.",
        errorType: "queue_error",
      });
    }

    jobId = jobData.id;
    const currentJobId = jobData.id;
    console.log("Processing image job inline:", { jobId: currentJobId, imageModel, aspectRatio });

    const gatewayResult = await callImageGateway(buildImagePrompt(prompt, aspectRatio), imageModel);

    if (!gatewayResult.ok) {
      const { errorType, errorMessage, debugDetail } = classifyError(gatewayResult.status, gatewayResult.rawText);
      await updateJob(supabaseAdmin, jobId, {
        status: "failed",
        error_message: errorMessage,
        error_type: errorType,
      });

      return jsonResponse({
        jobId,
        status: "failed",
        success: false,
        error: errorMessage,
        errorType,
        debugDetail,
        fallback: gatewayResult.status >= 500 || gatewayResult.status === 408,
      });
    }

    if (!gatewayResult.rawText.trim()) {
      await updateJob(supabaseAdmin, jobId, {
        status: "failed",
        error_message: "Empty response from model",
        error_type: "empty_response",
      });

      return jsonResponse({
        jobId,
        status: "failed",
        success: false,
        error: "Empty response from model",
        errorType: "empty_response",
      });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(gatewayResult.rawText);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected end of JSON input";
      await updateJob(supabaseAdmin, jobId, {
        status: "failed",
        error_message: `Failed to parse model response: ${message}`,
        error_type: "parse_error",
      });

      return jsonResponse({
        jobId,
        status: "failed",
        success: false,
        error: "Failed to parse model response",
        errorType: "parse_error",
        debugDetail: message,
        fallback: true,
      });
    }

    const imageUrl = parsed?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!imageUrl) {
      await updateJob(supabaseAdmin, jobId, {
        status: "failed",
        error_message: "No image returned from model",
        error_type: "no_image_returned",
      });

      return jsonResponse({
        jobId,
        status: "failed",
        success: false,
        error: "No image returned from model",
        errorType: "no_image_returned",
        debugDetail: gatewayResult.rawText.slice(0, 500),
      });
    }

    await updateJob(supabaseAdmin, jobId, {
      status: "completed",
      result_image_url: imageUrl,
      error_message: null,
      error_type: null,
    });

    return jsonResponse({
      jobId,
      status: "completed",
      success: true,
      imageUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in generate-image function:", error);

    if (jobId) {
      await updateJob(supabaseAdmin, jobId, {
        status: "failed",
        error_message: message,
        error_type: "processing_error",
      });
    }

    return jsonResponse({
      success: false,
      error: message,
      errorType: "processing_error",
      fallback: true,
    });
  }
});
