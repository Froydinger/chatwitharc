import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const REQUEST_TIMEOUT_MS = 55_000;
const RETRY_DELAY_MS = 3_000;

// All image editing is locked to OpenAI GPT-Image-2 at medium quality.
const DEFAULT_IMAGE_MODEL = 'openai/gpt-image-2';
const ALLOWED_IMAGE_MODELS = new Set<string>(['openai/gpt-image-2']);
function pickModel(requested?: string): string {
  return requested && ALLOWED_IMAGE_MODELS.has(requested) ? requested : DEFAULT_IMAGE_MODEL;
}

function aspectToSize(aspectRatio: string): string {
  const ratios: Record<string, 'square' | 'landscape' | 'portrait'> = {
    '1:1': 'square',
    '3:2': 'landscape',
    '4:3': 'landscape',
    '16:9': 'landscape',
    '21:9': 'landscape',
    '2:3': 'portrait',
    '3:4': 'portrait',
    '9:16': 'portrait',
  };
  const kind = ratios[aspectRatio] || 'square';
  if (kind === 'square') return '1024x1024';
  if (kind === 'portrait') return '1024x1536';
  return '1536x1024';
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function classifyError(status: number, rawText: string) {
  let debugDetail = rawText || 'Unknown error';
  let errorType = 'unknown';
  let errorMessage = 'Image editing failed. Please try again.';

  try {
    const json = JSON.parse(rawText);
    const detail = json.error?.message || json.message || json.error || rawText;
    debugDetail = typeof detail === 'string' ? detail : JSON.stringify(detail);
    const lower = debugDetail.toLowerCase();

    if (lower.includes('safety') || lower.includes('content policy') || lower.includes('blocked') || lower.includes('responsible ai')) {
      return { errorType: 'content_violation', errorMessage: 'Blocked by content safety filters. Try rephrasing your prompt.', debugDetail };
    }
    if (lower.includes('invalid_argument') || lower.includes('unable to process input image')) {
      return { errorType: 'invalid_input_image', errorMessage: "The source image couldn't be processed. Try a different image.", debugDetail };
    }
  } catch { /* not JSON */ }

  if (status === 408) { errorType = 'timeout'; errorMessage = 'Image editing timed out. Please try again.'; }
  else if (status === 429) { errorType = 'rate_limit'; errorMessage = 'Too many requests. Please wait and try again.'; }
  else if (status === 402) { errorType = 'payment_required'; errorMessage = 'Credits exhausted. Please add credits.'; }
  else if (status === 400) { errorType = 'invalid_request'; errorMessage = `Invalid request: ${debugDetail.slice(0, 200)}`; }
  else if (status >= 500) { errorType = 'provider_error'; errorMessage = `Image model error: ${debugDetail.slice(0, 200)}`; }

  return { errorType, errorMessage, debugDetail };
}

function buildEditPrompt(userPrompt: string, imageCount: number): string {
  let finalPrompt = '';
  if (imageCount > 1) finalPrompt += "Combine or merge the provided images based on the instruction. ";

  const lowerPrompt = userPrompt.toLowerCase();
  const isPortrait = ['same person', 'my face', 'selfie', 'headshot', 'portrait', 'look like me'].some(k => lowerPrompt.includes(k));
  if (isPortrait) finalPrompt += "Keep the same person and preserve facial identity.\n\n";

  finalPrompt += userPrompt;
  return finalPrompt;
}

async function updateJob(supabase: any, jobId: string, values: Record<string, unknown>) {
  const { error } = await supabase.from('image_generation_jobs').update(values as any).eq('id', jobId);
  if (error) console.error('Failed to update job:', jobId, error);
}

async function fetchImageAsBlob(url: string): Promise<{ blob: Blob; filename: string }> {
  if (url.startsWith('data:')) {
    const commaIdx = url.indexOf(',');
    const meta = url.slice(5, commaIdx); // e.g. image/png;base64
    const mime = meta.split(';')[0] || 'image/png';
    const b64 = url.slice(commaIdx + 1);
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const ext = mime.split('/')[1] || 'png';
    return { blob: new Blob([bytes], { type: mime }), filename: `input.${ext}` };
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch source image: ${res.status}`);
  const buf = await res.arrayBuffer();
  const type = res.headers.get('content-type') || 'image/png';
  const ext = type.split('/')[1]?.split(';')[0] || 'png';
  return { blob: new Blob([buf], { type }), filename: `input.${ext}` };
}

async function callEditGateway(prompt: string, imageUrls: string[], model: string, size: string, count: number) {
  // OpenAI gpt-image-2 editing uses the multipart /v1/images/edits endpoint.
  // The Lovable AI Gateway forwards this through for OpenAI image models.
  const blobs = await Promise.all(imageUrls.map(fetchImageAsBlob));

  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const form = new FormData();
      form.append('model', model);
      form.append('prompt', prompt);
      form.append('size', size);
      form.append('quality', 'medium');
      form.append('n', String(count));
      // Multiple images: OpenAI accepts repeated `image[]` field for gpt-image
      if (blobs.length === 1) {
        form.append('image', blobs[0].blob, blobs[0].filename);
      } else {
        for (const { blob, filename } of blobs) {
          form.append('image[]', blob, filename);
        }
      }

      const response = await fetch('https://ai.gateway.lovable.dev/v1/images/edits', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}` },
        body: form,
        signal: controller.signal,
      });
      const rawText = await response.text();
      clearTimeout(timeoutId);

      if (response.status === 429 && attempt === 0) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }
      return { ok: response.ok, status: response.status, rawText };
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        return { ok: false, status: 408, rawText: 'Request timeout' };
      }
      return { ok: false, status: 500, rawText: err instanceof Error ? err.message : 'Unknown fetch error' };
    }
  }
  return { ok: false, status: 429, rawText: 'Rate limit retry failed' };
}

function extractImageUrls(parsed: any): string[] {
  const out: string[] = [];
  const items = Array.isArray(parsed?.data) ? parsed.data : [];
  for (const item of items) {
    if (typeof item?.url === 'string' && item.url) out.push(item.url);
    else if (typeof item?.b64_json === 'string' && item.b64_json) {
      out.push(`data:image/png;base64,${item.b64_json}`);
    }
  }
  // Fallback for chat-completions-shaped responses (shouldn't happen here)
  if (out.length === 0) {
    const images = parsed?.choices?.[0]?.message?.images;
    if (Array.isArray(images)) {
      for (const im of images) {
        if (im?.image_url?.url) out.push(im.image_url.url);
      }
    }
  }
  return out;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  if (!LOVABLE_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ success: false, error: 'Image editing backend not configured.', errorType: 'configuration_error' });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'Missing authorization header' }, 401);

  const token = authHeader.replace('Bearer ', '');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return jsonResponse({ error: 'Invalid or expired token' }, 401);

  let jobId: string | null = null;

  try {
    const { prompt, baseImageUrl, baseImageUrls, aspectRatio, imageModel } = await req.json();
    const selectedModel = pickModel(imageModel);
    const aspect = (typeof aspectRatio === 'string' && aspectRatio.trim()) ? aspectRatio.trim() : '1:1';
    const size = aspectToSize(aspect);

    if (!prompt) return jsonResponse({ error: 'Prompt is required', errorType: 'invalid_request', success: false });

    const imageArray: string[] = baseImageUrls || (baseImageUrl ? [baseImageUrl] : []);
    if (imageArray.length === 0) return jsonResponse({ error: 'At least one image is required', errorType: 'invalid_request', success: false });
    // GPT-Image-2 image inputs are limited; cap at 10 for safety.
    if (imageArray.length > 10) return jsonResponse({ error: 'Maximum 10 images allowed', errorType: 'invalid_request', success: false });

    const blobUrls = imageArray.filter((url: string) => url.startsWith('blob:'));
    if (blobUrls.length > 0) {
      return jsonResponse({ error: "Source image couldn't be processed. Try re-uploading.", errorType: 'invalid_input_image', success: false });
    }

    const { data: jobData, error: jobError } = await supabase
      .from('image_generation_jobs')
      .insert({
        user_id: user.id,
        job_type: 'edit',
        prompt,
        base_image_urls: imageArray,
        aspect_ratio: aspect,
        preferred_model: selectedModel,
        status: 'processing',
        last_attempt_at: new Date().toISOString(),
        attempts: 1,
      })
      .select('id')
      .single();

    if (jobError || !jobData) {
      console.error('Failed to create edit job:', jobError);
      return jsonResponse({ error: 'Failed to start image editing', errorType: 'queue_error', success: false });
    }

    jobId = jobData.id;
    const currentJobId = jobData.id;
    const editPrompt = buildEditPrompt(prompt, imageArray.length);

    console.log(`Editing image with ${selectedModel} (${size}, medium) for job ${currentJobId}`);
    const result = await callEditGateway(editPrompt, imageArray, selectedModel, size, 1);

    if (!result.ok) {
      const err = classifyError(result.status, result.rawText);
      console.log(`Edit failed: ${err.errorType} (${result.status})`);
      await updateJob(supabase, currentJobId, { status: 'failed', error_message: err.errorMessage, error_type: err.errorType });
      return jsonResponse({ jobId: currentJobId, status: 'failed', success: false, error: err.errorMessage, errorType: err.errorType, debugDetail: err.debugDetail });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(result.rawText);
    } catch {
      await updateJob(supabase, currentJobId, { status: 'failed', error_message: 'Failed to parse response', error_type: 'parse_error' });
      return jsonResponse({ jobId: currentJobId, status: 'failed', success: false, error: 'Failed to parse response', errorType: 'parse_error', debugDetail: result.rawText.slice(0, 200) });
    }

    const imageUrls = extractImageUrls(parsed);
    if (imageUrls.length === 0) {
      await updateJob(supabase, currentJobId, { status: 'failed', error_message: 'No image returned', error_type: 'no_image_returned' });
      return jsonResponse({ jobId: currentJobId, status: 'failed', success: false, error: 'No image returned', errorType: 'no_image_returned', debugDetail: result.rawText.slice(0, 500) });
    }

    const imageUrl = imageUrls[0];
    console.log(`Edit succeeded for job ${currentJobId} (${imageUrls.length} image${imageUrls.length === 1 ? '' : 's'})`);
    await updateJob(supabase, currentJobId, { status: 'completed', result_image_url: imageUrl, error_message: null, error_type: null });
    return jsonResponse({ jobId: currentJobId, status: 'completed', success: true, imageUrl, imageUrls });

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in edit-image:', error);
    if (jobId) await updateJob(supabase, jobId, { status: 'failed', error_message: message, error_type: 'processing_error' });
    return jsonResponse({ success: false, error: message, errorType: 'processing_error' });
  }
});
