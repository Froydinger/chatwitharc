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
const DEFAULT_MODEL = 'google/gemini-3.1-flash-image-preview';
const REQUEST_TIMEOUT_MS = 55_000;
const RETRY_DELAY_MS = 3_000;

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

    const blobUrls = imageArray.filter(url => url.startsWith('blob:'));
    if (blobUrls.length > 0) {
      return jsonResponse({ error: "Source image couldn't be processed. Try re-uploading.", errorType: 'invalid_input_image', success: false });
    }

    // Create job record
    const { data: jobData, error: jobError } = await supabase
      .from('image_generation_jobs')
      .insert({
        user_id: user.id,
        job_type: 'edit',
        prompt,
        base_image_urls: imageArray,
        aspect_ratio: aspectRatio || '16:9',
        preferred_model: imageModel,
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
    const model = DEFAULT_MODEL;
    const editPrompt = buildEditPrompt(prompt, imageArray.length);

    console.log('Processing edit job inline:', { jobId: currentJobId, model, images: imageArray.length });

    const result = await callEditGateway(editPrompt, imageArray, model, aspectRatio || '16:9');

    if (!result.ok) {
      const { errorType, errorMessage, debugDetail } = classifyError(result.status, result.rawText);
      await updateJob(supabase, currentJobId, { status: 'failed', error_message: errorMessage, error_type: errorType });
      return jsonResponse({ jobId: currentJobId, status: 'failed', success: false, error: errorMessage, errorType, debugDetail });
    }

    if (!result.rawText.trim()) {
      await updateJob(supabase, currentJobId, { status: 'failed', error_message: 'Empty response', error_type: 'empty_response' });
      return jsonResponse({ jobId: currentJobId, status: 'failed', success: false, error: 'Empty response from model', errorType: 'empty_response' });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(result.rawText);
    } catch {
      await updateJob(supabase, currentJobId, { status: 'failed', error_message: 'Failed to parse response', error_type: 'parse_error' });
      return jsonResponse({ jobId: currentJobId, status: 'failed', success: false, error: 'Failed to parse model response', errorType: 'parse_error' });
    }

    const imageUrl = parsed?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!imageUrl) {
      await updateJob(supabase, currentJobId, { status: 'failed', error_message: 'No image returned', error_type: 'no_image_returned' });
      return jsonResponse({ jobId: currentJobId, status: 'failed', success: false, error: 'No image returned from model', errorType: 'no_image_returned' });
    }

    await updateJob(supabase, currentJobId, { status: 'completed', result_image_url: imageUrl, error_message: null, error_type: null });
    return jsonResponse({ jobId: currentJobId, status: 'completed', success: true, imageUrl });

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in edit-image:', error);
    if (jobId) await updateJob(supabase, jobId, { status: 'failed', error_message: message, error_type: 'processing_error' });
    return jsonResponse({ success: false, error: message, errorType: 'processing_error' });
  }
});
