import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { Image, decode } from "https://deno.land/x/imagescript@1.2.17/mod.ts";
import { uploadImageToR2 } from "../_shared/r2.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const OPENAI_TIMEOUT_MS = 180_000;
const DEFAULT_IMAGE_MODEL = 'gpt-image-2';
const ALLOWED_IMAGE_MODELS = new Set<string>(['gpt-image-1', 'gpt-image-1-mini', 'gpt-image-2']);
function pickModel(requested?: string): string {
  return requested && ALLOWED_IMAGE_MODELS.has(requested) ? requested : DEFAULT_IMAGE_MODEL;
}

function toOpenAIModel(model: string): string {
  return model.startsWith('openai/') ? model.slice('openai/'.length) : model;
}

function wantsTransparentBackground(prompt: string): boolean {
  const normalized = prompt.toLowerCase().replace(/[\s_-]+/g, ' ');
  return [
    /\btransparent (?:background|backdrop|canvas|png)\b/,
    /\b(?:background|backdrop|canvas) (?:is |should be )?transparent\b/,
    /\b(?:with|on) (?:an? )?(?:actual(?:ly)? |fully )?transparent background\b/,
    /\bno (?:background|backdrop)\b/,
    /\bremove (?:the )?(?:background|backdrop)\b/,
    /\bcut ?out (?:with|on) (?:an? )?transparent background\b/,
    /\btransparent alpha\b/,
  ].some((pattern) => pattern.test(normalized));
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

/**
 * "source" means: keep the shape of the image being edited. An edit should not
 * silently restretch someone's square image into landscape just because that's
 * the generation default.
 */
const SOURCE_ASPECT = 'source';

function sizeFromDimensions(width: number, height: number): string {
  if (!width || !height) return '1024x1024';
  const ratio = width / height;
  // ~7% tolerance around square keeps near-square crops from tipping over.
  if (ratio > 1.07) return '1536x1024';
  if (ratio < 0.93) return '1024x1536';
  return '1024x1024';
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
    if (
      lower.includes('invalid_argument') ||
      lower.includes('unable to process input image') ||
      lower.includes('invalid image file or mode')
    ) {
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

function buildEditPrompt(userPrompt: string, imageCount: number, isYouTube: boolean): string {
  let finalPrompt = '';
  if (imageCount > 1) finalPrompt += "Combine or merge the provided images based on the instruction. ";
  const lower = userPrompt.toLowerCase();
  if (['same person', 'my face', 'selfie', 'headshot', 'portrait', 'look like me'].some(k => lower.includes(k))) {
    finalPrompt += "Keep the same person and preserve facial identity.\n\n";
  }
  finalPrompt += userPrompt;
  if (isYouTube) {
    finalPrompt += `\n\nIMPORTANT COMPOSITION RULE: Render this as a 16:9 widescreen image. The full canvas is 1536x1024, but place ALL meaningful content within the centered 1536x864 region. Add solid pure black (#000000) letterbox bars exactly 80 pixels tall at the very top and very bottom of the image. The black bars must be uniformly solid black, edge-to-edge, with no gradients, textures, or content. Treat them as off-screen padding.`;
  }
  return finalPrompt;
}

async function updateJob(supabase: any, jobId: string, values: Record<string, unknown>) {
  const { error } = await supabase.from('image_generation_jobs').update(values as any).eq('id', jobId);
  if (error) console.error('Failed to update job:', jobId, error);
}

// Sniff magic bytes and return a MIME OpenAI's edits endpoint accepts.
function sniffImageMime(bytes: Uint8Array): { mime: string; ext: string } | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
      && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return { mime: 'image/webp', ext: 'webp' };
  }
  return null;
}

function parseImageDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  try {
    // PNG: IHDR at offset 16 (width), 20 (height)
    if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const width = view.getUint32(16, false);
      const height = view.getUint32(20, false);
      if (width > 0 && height > 0) return { width, height };
    }
    // JPEG: scan SOF markers (0xFF 0xC0 .. 0xC3)
    if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
      let offset = 2;
      while (offset < bytes.length - 8) {
        if (bytes[offset] !== 0xff) { offset++; continue; }
        const marker = bytes[offset + 1];
        if (marker >= 0xc0 && marker <= 0xc3) {
          const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
          const height = view.getUint16(offset + 5, false);
          const width = view.getUint16(offset + 7, false);
          if (width > 0 && height > 0) return { width, height };
        }
        const len = (bytes[offset + 2] << 8) | bytes[offset + 3];
        offset += 2 + len;
      }
    }
    // WebP
    if (bytes.length >= 30 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
        bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
      const tag = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
      if (tag === 'VP8X' && bytes.length >= 30) {
        const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
        const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
        return { width, height };
      }
      if (tag === 'VP8 ' && bytes.length >= 30) {
        const width = ((bytes[27] << 8) | bytes[26]) & 0x3fff;
        const height = ((bytes[29] << 8) | bytes[28]) & 0x3fff;
        return { width, height };
      }
      if (tag === 'VP8L' && bytes.length >= 25) {
        const b0 = bytes[21], b1 = bytes[22], b2 = bytes[23], b3 = bytes[24];
        const width = 1 + (b0 | ((b1 & 0x3f) << 8));
        const height = 1 + (((b1 >> 6) | (b2 << 2) | ((b3 & 0xf) << 10)));
        return { width, height };
      }
    }
  } catch {
    // Header parsing failed; fall through to decoding
  }
  return null;
}

function bytesToB64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function fetchImageAsBlob(url: string, idx: number): Promise<{ blob: Blob; filename: string; b64: string; mime: string; width: number; height: number }> {
  let bytes: Uint8Array;
  if (url.startsWith('data:')) {
    const commaIdx = url.indexOf(',');
    const b64 = url.slice(commaIdx + 1);
    const bin = atob(b64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } else {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch source image: ${res.status}`);
    bytes = new Uint8Array(await res.arrayBuffer());
  }

  const sniffed = sniffImageMime(bytes);
  let width = 0;
  let height = 0;

  if (sniffed?.mime === 'image/png') {
    const dims = parseImageDimensions(bytes);
    if (dims) {
      width = dims.width;
      height = dims.height;
    }
  }

  // Fast path: if source is already a PNG and <= 1024x1024, pass directly!
  if (sniffed?.mime === 'image/png' && width > 0 && width <= 1024 && height > 0 && height <= 1024) {
    const blobBytes = new Uint8Array(bytes.byteLength);
    blobBytes.set(bytes);
    return {
      blob: new Blob([blobBytes.buffer], { type: 'image/png' }),
      filename: `input-${idx}.png`,
      b64: bytesToB64(bytes),
      mime: 'image/png',
      width,
      height,
    };
  }

  // OpenAI /v1/images/edits ONLY accepts PNG format. Convert JPEG/WebP or resize oversized PNG to <=1024x1024 PNG.
  try {
    const decoded = (await decode(bytes)) as Image;
    width = decoded.width;
    height = decoded.height;

    let target = decoded;
    if (width > 1024 || height > 1024) {
      const scale = Math.min(1024 / width, 1024 / height);
      target = decoded.resize(Math.round(width * scale), Math.round(height * scale));
    }
    const pngBytes = await target.encode();
    const blobBytes = new Uint8Array(pngBytes.byteLength);
    blobBytes.set(pngBytes);
    return {
      blob: new Blob([blobBytes.buffer], { type: 'image/png' }),
      filename: `input-${idx}.png`,
      b64: bytesToB64(pngBytes),
      mime: 'image/png',
      width: target.width,
      height: target.height,
    };
  } catch (e) {
    throw new Error(
      `Source image could not be converted to PNG: ${e instanceof Error ? e.message : 'decode failed'}`,
    );
  }
}

// Crop a 3:2 (1536x1024) image to true 16:9 (1536x864) by removing equal
// horizontal slices from top and bottom. Returns a data URL of the cropped PNG.
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
  const decoded = await decode(bytes) as Image;
  const w = decoded.width;
  const h = decoded.height;
  const targetH = Math.round((w * 9) / 16);
  if (targetH >= h) return imageUrl;
  const yOffset = Math.floor((h - targetH) / 2);
  const cropped = decoded.crop(0, yOffset, w, targetH);
  const out = await cropped.encode();
  return `data:image/png;base64,${bytesToB64(out)}`;
}

async function callOpenAIEditsSingle(prompt: string, blobs: { blob: Blob; filename: string }[], model: string, _size: string) {
  const endpoint = 'https://api.openai.com/v1/images/edits';
  const headers = { 'Authorization': `Bearer ${OPENAI_API_KEY}` };
  const modelName = toOpenAIModel(model);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
  try {
    const form = new FormData();
    form.append('model', modelName);
    form.append('prompt', prompt);
    // /v1/images/edits only accepts 1024x1024, 512x512, 256x256. Do NOT pass quality parameter.
    form.append('size', '1024x1024');
    form.append('n', '1');
    if (modelName === 'gpt-image-2' && wantsTransparentBackground(prompt)) {
      form.append('background', 'transparent');
      form.append('output_format', 'png');
    }
    form.append('image', blobs[0].blob, 'image.png');

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

async function callOpenAIEdits(prompt: string, blobs: { blob: Blob; filename: string }[], model: string, size: string, count: number) {
  if (count <= 1) {
    return callOpenAIEditsSingle(prompt, blobs, model, size);
  }

  // Issue parallel requests for count > 1 to avoid serial OpenAI 60s+ gateway timeouts
  const results = await Promise.all(
    Array.from({ length: count }, () => callOpenAIEditsSingle(prompt, blobs, model, size))
  );

  const successful = results.filter((r) => r.ok);
  if (successful.length > 0) {
    // Combine data arrays from all successful responses
    const combinedData: any[] = [];
    for (const res of successful) {
      try {
        const parsed = JSON.parse(res.rawText);
        if (Array.isArray(parsed?.data)) {
          combinedData.push(...parsed.data);
        }
      } catch {
        // Failed to parse chunk response; continue with next chunk
      }
    }
    return {
      ok: true,
      status: 200,
      rawText: JSON.stringify({ data: combinedData }),
    };
  }

  // If all failed, return the first error
  return results[0];
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

async function processEditJob(jobId: string, userId: string, prompt: string, imageArray: string[], aspect: string, count: number, selectedModel: string, isYouTube: boolean) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  let successfulCount = 0;
  try {
    const sources = await Promise.all(imageArray.map((url, i) => fetchImageAsBlob(url, i)));

    // "source" resolves against the first image's real dimensions, so an edit
    // keeps the shape it started with. An explicit pick always wins.
    const size = aspect === SOURCE_ASPECT
      ? sizeFromDimensions(sources[0]?.width ?? 0, sources[0]?.height ?? 0)
      : aspectToSize(aspect);
    if (aspect === SOURCE_ASPECT) {
      console.log(`[job ${jobId}] matching source shape ${sources[0]?.width}x${sources[0]?.height} -> ${size}`);
    }

    console.log(`[job ${jobId}] OpenAI edit attempt (${size}, n=${count}${isYouTube ? ', youtube' : ''})`);
    const primary = await callOpenAIEdits(prompt, sources, selectedModel, size, count);

    let urls: string[] = [];
    let primaryErr: ReturnType<typeof classifyError> | null = null;

    if (primary.ok) {
      try {
        const parsed = JSON.parse(primary.rawText);
        urls = extractOpenAIImageUrls(parsed);
      } catch {
        console.warn(`[job ${jobId}] OpenAI response parse failed`);
      }
    } else {
      primaryErr = classifyError(primary.status, primary.rawText);
      console.warn(`[job ${jobId}] OpenAI failed (${primary.status} / ${primaryErr.errorType}): ${primaryErr.debugDetail.slice(0, 240)}`);
    }

    if (urls.length === 0) {
      const err = primaryErr ?? {
        errorType: 'provider_error',
        errorMessage: 'OpenAI returned no edited image. Please try again.',
        debugDetail: 'Empty OpenAI image response',
      };
      await updateJob(supabase, jobId, { status: 'failed', error_message: err.errorMessage, error_type: err.errorType });
      console.error(`[job ${jobId}] OpenAI image edit failed: ${err.debugDetail.slice(0, 240)}`);
      return;
    }

    // YouTube 16:9: crop every output (OpenAI or Gemini) before upload.
    if (isYouTube) {
      urls = await Promise.all(urls.map(async (u) => {
        try { return await cropTo16x9(u); } catch (e) { console.error(`[job ${jobId}] 16:9 crop failed:`, e); return u; }
      }));
    }

    const finalUrls = await Promise.all(
      urls.map((url, index) => uploadImageToR2(url, {
        userId,
        kind: 'edited',
        index,
      })),
    );
    await updateJob(supabase, jobId, {
      status: 'completed',
      result_image_url: finalUrls[0],
      result_image_urls: finalUrls,
      fallback_model: null,
      error_message: null,
      error_type: null,
    });
    successfulCount = finalUrls.length;
    console.log(`[job ${jobId}] completed (${finalUrls.length} image${finalUrls.length === 1 ? '' : 's'})`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[job ${jobId}] processing error:`, err);
    await updateJob(supabase, jobId, { status: 'failed', error_message: message, error_type: 'processing_error' });
  } finally {
    const { error } = await supabase.rpc('finalize_image_quota', {
      target_job_id: jobId,
      successful_count: successfulCount,
    });
    if (error) console.error(`[job ${jobId}] failed to finalize image quota:`, error);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  if (!OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ success: false, error: 'Image editing backend not configured.', errorType: 'configuration_error' });
  }

  // All failures return 200 with success:false. A non-2xx reaches the client as
  // supabase-js's opaque "Edge Function returned a non-2xx status code", which
  // buries the actual reason; errorType carries the semantics instead.
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ success: false, error: 'You need to be signed in to edit images.', errorType: 'auth_error' });
  }

  const token = authHeader.replace('Bearer ', '');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return jsonResponse({ success: false, error: 'Your session expired. Please sign in again.', errorType: 'auth_error' });
  }
  if (user.is_anonymous) {
    return jsonResponse({
      success: false,
      error: 'Create a free account to edit images.',
      errorType: 'account_required',
    });
  }

  try {
    const { prompt, baseImageUrl, baseImageUrls, aspectRatio, imageModel, count } = await req.json();
    const selectedModel = pickModel(imageModel);
    // Edits default to keeping the source image's shape. Only an explicit,
    // recognized aspect ratio overrides that.
    const rawAspect = (typeof aspectRatio === 'string' && aspectRatio.trim()) ? aspectRatio.trim() : SOURCE_ASPECT;
    const aspect = rawAspect === SOURCE_ASPECT || rawAspect === 'auto' ? SOURCE_ASPECT : rawAspect;
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
        // Source images are only needed by this invocation. Persisting data URLs
        // here stores megabytes of base64 in Postgres and can exhaust the DB disk.
        base_image_urls: null,
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
    const { data: quota, error: quotaError } = await supabase.rpc('reserve_image_quota', {
      target_user_id: user.id,
      target_job_id: jobId,
      requested_count: requestedCount,
    });
    if (quotaError) {
      await updateJob(supabase, jobId, { status: 'failed', error_message: 'Could not reserve image quota', error_type: 'quota_error' });
      return jsonResponse({ success: false, error: "Could not check today's image allowance.", errorType: 'quota_error' });
    }
    if (!quota?.allowed) {
      await updateJob(supabase, jobId, { status: 'failed', error_message: 'Daily image limit reached', error_type: 'daily_limit' });
      return jsonResponse({
        success: false,
        error: `Daily image limit reached. ${quota?.remaining ?? 0} of 20 remaining.`,
        errorType: 'daily_limit',
        quota,
      });
    }
    const isYouTube = aspect === '16:9';
    const transparent = selectedModel === 'gpt-image-2' && wantsTransparentBackground(prompt);
    const editPrompt = buildEditPrompt(prompt, imageArray.length, isYouTube && !transparent);

    // Kick off processing in background; respond immediately so we never get killed
    // by the platform's per-request wall timeout.
    const task = processEditJob(jobId, user.id, editPrompt, imageArray, aspect, requestedCount, selectedModel, isYouTube && !transparent);
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
      EdgeRuntime.waitUntil(task);
    } else {
      // Fall back to fire-and-forget (still works in most runtimes)
      task.catch(e => console.error('Background task error:', e));
    }

    return jsonResponse({ jobId, status: 'pending', success: true, quota });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in edit-image:', error);
    return jsonResponse({ success: false, error: message, errorType: 'processing_error' });
  }
});
