import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { Image, decode } from "https://deno.land/x/imagescript@1.2.17/mod.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const OPENAI_TIMEOUT_MS = 180_000;
const FALLBACK_MODEL = 'google/gemini-3.1-flash-image';

const DEFAULT_IMAGE_MODEL = 'openai/gpt-image-2';
const ALLOWED_IMAGE_MODELS = new Set<string>(['openai/gpt-image-2']);
function pickModel(requested?: string): string {
  return requested && ALLOWED_IMAGE_MODELS.has(requested) ? requested : DEFAULT_IMAGE_MODEL;
}

function toOpenAIModel(model: string): string {
  return model.startsWith('openai/') ? model.slice('openai/'.length) : model;
}

function aspectToSize(aspectRatio: string): string {
  const ratios: Record<string, 'square' | 'landscape' | 'portrait'> = {
    '1:1': 'square', '3:2': 'landscape', '4:3': 'landscape', '16:9': 'landscape', '21:9': 'landscape',
    '2:3': 'portrait', '3:4': 'portrait', '9:16': 'portrait',
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
  const lower = userPrompt.toLowerCase();
  if (['same person', 'my face', 'selfie', 'headshot', 'portrait', 'look like me'].some(k => lower.includes(k))) {
    finalPrompt += "Keep the same person and preserve facial identity.\n\n";
  }
  finalPrompt += userPrompt;
  return finalPrompt;
}

async function updateJob(supabase: any, jobId: string, values: Record<string, unknown>) {
  const { error } = await supabase.from('image_generation_jobs').update(values as any).eq('id', jobId);
  if (error) console.error('Failed to update job:', jobId, error);
}

async function fetchImageAsBlob(url: string): Promise<{ blob: Blob; filename: string; b64: string; mime: string }> {
  if (url.startsWith('data:')) {
    const commaIdx = url.indexOf(',');
    const meta = url.slice(5, commaIdx);
    const mime = meta.split(';')[0] || 'image/png';
    const b64 = url.slice(commaIdx + 1);
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const ext = mime.split('/')[1] || 'png';
    return { blob: new Blob([bytes], { type: mime }), filename: `input.${ext}`, b64, mime };
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch source image: ${res.status}`);
  const buf = await res.arrayBuffer();
  const type = res.headers.get('content-type') || 'image/png';
  const ext = type.split('/')[1]?.split(';')[0] || 'png';
  // base64 encode
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const b64 = btoa(binary);
  return { blob: new Blob([buf], { type }), filename: `input.${ext}`, b64, mime: type };
}

async function callOpenAIEdits(prompt: string, blobs: { blob: Blob; filename: string }[], model: string, size: string, count: number) {
  const endpoint = OPENAI_API_KEY
    ? 'https://api.openai.com/v1/images/edits'
    : 'https://ai.gateway.lovable.dev/v1/images/edits';
  const headers = OPENAI_API_KEY
    ? { 'Authorization': `Bearer ${OPENAI_API_KEY}` }
    : { 'Authorization': `Bearer ${LOVABLE_API_KEY}` };
  const modelName = OPENAI_API_KEY ? toOpenAIModel(model) : model;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
  try {
    const form = new FormData();
    form.append('model', modelName);
    form.append('prompt', prompt);
    form.append('size', size);
    form.append('quality', 'low');
    form.append('n', String(count));
    if (blobs.length === 1) {
      form.append('image', blobs[0].blob, blobs[0].filename);
    } else {
      for (const { blob, filename } of blobs) form.append('image[]', blob, filename);
    }
    const response = await fetch(endpoint, { method: 'POST', headers, body: form, signal: controller.signal });
    const rawText = await response.text();
    clearTimeout(timeoutId);
    return { ok: response.ok, status: response.status, rawText };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') return { ok: false, status: 408, rawText: 'Request timeout' };
    return { ok: false, status: 500, rawText: err instanceof Error ? err.message : 'Unknown fetch error' };
  }
}

async function callGeminiEdit(prompt: string, sources: { b64: string; mime: string }[], count: number) {
  // Lovable AI Gateway chat-completions image shape for Gemini image models.
  // We request `count` images by issuing parallel calls (Gemini doesn't take `n`).
  const endpoint = 'https://ai.gateway.lovable.dev/v1/chat/completions';
  const headers = {
    'Authorization': `Bearer ${LOVABLE_API_KEY}`,
    'Content-Type': 'application/json',
  };
  const content: any[] = [{ type: 'text', text: prompt }];
  for (const s of sources) {
    content.push({ type: 'image_url', image_url: { url: `data:${s.mime};base64,${s.b64}` } });
  }
  const body = {
    model: FALLBACK_MODEL,
    messages: [{ role: 'user', content }],
    modalities: ['image', 'text'],
  };
  const runOne = async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const rawText = await res.text();
      clearTimeout(timeoutId);
      return { ok: res.ok, status: res.status, rawText };
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') return { ok: false, status: 408, rawText: 'Request timeout' };
      return { ok: false, status: 500, rawText: err instanceof Error ? err.message : 'Unknown fetch error' };
    }
  };
  const results = await Promise.all(Array.from({ length: Math.max(1, count) }, runOne));
  const urls: string[] = [];
  let lastErr: { status: number; rawText: string } | null = null;
  for (const r of results) {
    if (!r.ok) { lastErr = { status: r.status, rawText: r.rawText }; continue; }
    try {
      const parsed = JSON.parse(r.rawText);
      // Gateway-normalized OpenAI shape OR chat-completions images
      const data = Array.isArray(parsed?.data) ? parsed.data : [];
      for (const item of data) {
        if (typeof item?.url === 'string') urls.push(item.url);
        else if (typeof item?.b64_json === 'string') urls.push(`data:image/png;base64,${item.b64_json}`);
      }
      if (urls.length === 0) {
        const images = parsed?.choices?.[0]?.message?.images;
        if (Array.isArray(images)) {
          for (const im of images) if (im?.image_url?.url) urls.push(im.image_url.url);
        }
      }
    } catch {
      lastErr = { status: 500, rawText: r.rawText };
    }
  }
  if (urls.length === 0 && lastErr) return { ok: false, status: lastErr.status, rawText: lastErr.rawText, urls: [] };
  return { ok: true, status: 200, rawText: '', urls };
}

function extractOpenAIImageUrls(parsed: any): string[] {
  const out: string[] = [];
  const items = Array.isArray(parsed?.data) ? parsed.data : [];
  for (const item of items) {
    if (typeof item?.url === 'string' && item.url) out.push(item.url);
    else if (typeof item?.b64_json === 'string' && item.b64_json) {
      out.push(`data:image/png;base64,${item.b64_json}`);
    }
  }
  return out;
}

async function uploadDataUrlsToStorage(supabase: any, userId: string, urls: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const url of urls) {
    if (!url.startsWith('data:')) { out.push(url); continue; }
    try {
      const commaIdx = url.indexOf(',');
      const meta = url.slice(5, commaIdx);
      const mime = meta.split(';')[0] || 'image/png';
      const b64 = url.slice(commaIdx + 1);
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const ext = mime.split('/')[1] || 'png';
      const name = `${userId}/edited-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('avatars').upload(name, new Blob([bytes], { type: mime }), { contentType: mime, upsert: false });
      if (error) { out.push(url); continue; }
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(name);
      out.push(pub?.publicUrl || url);
    } catch {
      out.push(url);
    }
  }
  return out;
}

async function processEditJob(jobId: string, userId: string, prompt: string, imageArray: string[], size: string, count: number, selectedModel: string) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  try {
    const sources = await Promise.all(imageArray.map(fetchImageAsBlob));
    console.log(`[job ${jobId}] OpenAI edit attempt (${size}, n=${count})`);
    const primary = await callOpenAIEdits(prompt, sources, selectedModel, size, count);

    let urls: string[] = [];
    let fallbackUsed: string | null = null;

    if (primary.ok) {
      try {
        const parsed = JSON.parse(primary.rawText);
        urls = extractOpenAIImageUrls(parsed);
      } catch {
        console.warn(`[job ${jobId}] OpenAI response parse failed`);
      }
    } else {
      console.warn(`[job ${jobId}] OpenAI failed (${primary.status}); attempting Gemini fallback`);
    }

    if (urls.length === 0) {
      const fb = await callGeminiEdit(prompt, sources.map(s => ({ b64: s.b64, mime: s.mime })), count);
      if (fb.ok && fb.urls.length > 0) {
        urls = fb.urls;
        fallbackUsed = FALLBACK_MODEL;
      } else {
        const err = classifyError(primary.ok ? fb.status : primary.status, primary.ok ? fb.rawText : primary.rawText);
        await updateJob(supabase, jobId, { status: 'failed', error_message: err.errorMessage, error_type: err.errorType });
        console.error(`[job ${jobId}] both models failed`);
        return;
      }
    }

    const finalUrls = await uploadDataUrlsToStorage(supabase, userId, urls);
    await updateJob(supabase, jobId, {
      status: 'completed',
      result_image_url: finalUrls[0],
      result_image_urls: finalUrls,
      fallback_model: fallbackUsed,
      error_message: null,
      error_type: null,
    });
    console.log(`[job ${jobId}] completed (${finalUrls.length} image${finalUrls.length === 1 ? '' : 's'}${fallbackUsed ? `, fallback=${fallbackUsed}` : ''})`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[job ${jobId}] processing error:`, err);
    await updateJob(supabase, jobId, { status: 'failed', error_message: message, error_type: 'processing_error' });
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  if ((!OPENAI_API_KEY && !LOVABLE_API_KEY) || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ success: false, error: 'Image editing backend not configured.', errorType: 'configuration_error' });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'Missing authorization header' }, 401);

  const token = authHeader.replace('Bearer ', '');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return jsonResponse({ error: 'Invalid or expired token' }, 401);

  try {
    const { prompt, baseImageUrl, baseImageUrls, aspectRatio, imageModel, count } = await req.json();
    const selectedModel = pickModel(imageModel);
    const aspect = (typeof aspectRatio === 'string' && aspectRatio.trim()) ? aspectRatio.trim() : '1:1';
    const size = aspectToSize(aspect);
    const requestedCount = Math.max(1, Math.min(3, Math.floor(Number(count) || 1)));

    if (!prompt) return jsonResponse({ error: 'Prompt is required', errorType: 'invalid_request', success: false });

    const imageArray: string[] = baseImageUrls || (baseImageUrl ? [baseImageUrl] : []);
    if (imageArray.length === 0) return jsonResponse({ error: 'At least one image is required', errorType: 'invalid_request', success: false });
    if (imageArray.length > 10) return jsonResponse({ error: 'Maximum 10 source images allowed', errorType: 'invalid_request', success: false });

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

    const jobId = jobData.id;
    const editPrompt = buildEditPrompt(prompt, imageArray.length);

    // Kick off processing in background; respond immediately so we never get killed
    // by the platform's per-request wall timeout.
    const task = processEditJob(jobId, user.id, editPrompt, imageArray, size, requestedCount, selectedModel);
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
      EdgeRuntime.waitUntil(task);
    } else {
      // Fall back to fire-and-forget (still works in most runtimes)
      task.catch(e => console.error('Background task error:', e));
    }

    return jsonResponse({ jobId, status: 'pending', success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in edit-image:', error);
    return jsonResponse({ success: false, error: message, errorType: 'processing_error' });
  }
});
