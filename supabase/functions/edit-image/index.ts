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

const MODEL_FALLBACK_CHAIN = [
  'google/gemini-3.1-flash-image-preview',
  'google/gemini-3-pro-image-preview',
  'google/gemini-2.5-flash-image',
];

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

function isRetryableFailure(status: number, rawText: string): boolean {
  if (status === 400 || status === 402 || status === 403) return false;
  const lower = rawText.toLowerCase();
  if (lower.includes('safety') || lower.includes('content policy') || lower.includes('blocked') || lower.includes('responsible ai') || lower.includes('content violation')) return false;
  if (lower.includes('invalid_argument') || lower.includes('unable to process input image')) return false;
  return status >= 500 || status === 408 || status === 429 || lower.includes('1102');
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

async function callEditGateway(prompt: string, imageUrls: string[], model: string, aspectRatio: string) {
  const aspectPrompt = `Output the image in ${aspectRatio} aspect ratio. ${prompt}`;
  const contentArray: any[] = [{ type: 'text', text: aspectPrompt }];
  imageUrls.forEach(url => contentArray.push({ type: 'image_url', image_url: { url } }));

  const requestBody = JSON.stringify({
    model,
    messages: [{ role: 'user', content: contentArray }],
    modalities: ['image', 'text'],
  });

  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: requestBody,
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

function buildFallbackChain(preferredModel?: string): string[] {
  const chain = [...MODEL_FALLBACK_CHAIN];
  if (preferredModel && !chain.includes(preferredModel)) {
    chain.unshift(preferredModel);
  } else if (preferredModel && chain.includes(preferredModel)) {
    const idx = chain.indexOf(preferredModel);
    chain.splice(idx, 1);
    chain.unshift(preferredModel);
  }
  return chain;
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
    const { prompt, baseImageUrl, baseImageUrls, imageModel, aspectRatio } = await req.json();

    if (!prompt) return jsonResponse({ error: 'Prompt is required', errorType: 'invalid_request', success: false });

    const imageArray: string[] = baseImageUrls || (baseImageUrl ? [baseImageUrl] : []);
    if (imageArray.length === 0) return jsonResponse({ error: 'At least one image is required', errorType: 'invalid_request', success: false });
    if (imageArray.length > 14) return jsonResponse({ error: 'Maximum 14 images allowed', errorType: 'invalid_request', success: false });

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
        aspect_ratio: aspectRatio || '16:9',
        preferred_model: imageModel || MODEL_FALLBACK_CHAIN[0],
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
    const fallbackChain = buildFallbackChain(imageModel);

    let lastError: { errorType: string; errorMessage: string; debugDetail: string } | null = null;

    for (const model of fallbackChain) {
      console.log(`Trying model ${model} for edit job ${currentJobId}`);
      const result = await callEditGateway(editPrompt, imageArray, model, aspectRatio || '16:9');

      if (!result.ok) {
        const err = classifyError(result.status, result.rawText);
        console.log(`Model ${model} failed: ${err.errorType} (${result.status})`);

        if (!isRetryableFailure(result.status, result.rawText)) {
          await updateJob(supabase, currentJobId, { status: 'failed', error_message: err.errorMessage, error_type: err.errorType });
          return jsonResponse({ jobId: currentJobId, status: 'failed', success: false, error: err.errorMessage, errorType: err.errorType, debugDetail: err.debugDetail });
        }

        lastError = err;
        continue;
      }

      if (!result.rawText.trim()) {
        lastError = { errorType: 'empty_response', errorMessage: 'Empty response', debugDetail: 'Empty response' };
        continue;
      }

      let parsed: any;
      try {
        parsed = JSON.parse(result.rawText);
      } catch {
        lastError = { errorType: 'parse_error', errorMessage: 'Failed to parse response', debugDetail: result.rawText.slice(0, 200) };
        continue;
      }

      const imageUrl = parsed?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      if (!imageUrl) {
        lastError = { errorType: 'no_image_returned', errorMessage: 'No image returned', debugDetail: result.rawText.slice(0, 500) };
        continue;
      }

      // Success!
      console.log(`Edit succeeded with model ${model} for job ${currentJobId}`);
      await updateJob(supabase, currentJobId, { status: 'completed', result_image_url: imageUrl, error_message: null, error_type: null });
      return jsonResponse({ jobId: currentJobId, status: 'completed', success: true, imageUrl });
    }

    // All models exhausted
    await updateJob(supabase, currentJobId, { status: 'failed', error_message: lastError?.errorMessage || 'All models failed', error_type: lastError?.errorType || 'all_models_failed' });
    return jsonResponse({ jobId: currentJobId, status: 'failed', success: false, error: lastError?.errorMessage || 'All image models failed', errorType: lastError?.errorType || 'all_models_failed' });

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in edit-image:', error);
    if (jobId) await updateJob(supabase, jobId, { status: 'failed', error_message: message, error_type: 'processing_error' });
    return jsonResponse({ success: false, error: message, errorType: 'processing_error' });
  }
});
