import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function classifyError(status: number, rawText: string): { errorType: string; errorMessage: string; debugDetail: string } {
  let debugDetail = rawText;
  let errorType = 'unknown';
  let errorMessage = 'Image editing failed. Please try again.';

  try {
    const json = JSON.parse(rawText);
    const detail = json.error?.message || json.message || json.error || rawText;
    debugDetail = typeof detail === 'string' ? detail : JSON.stringify(detail);

    const lower = debugDetail.toLowerCase();
    if (lower.includes('safety') || lower.includes('content policy') || lower.includes('blocked') || lower.includes('content violation') || lower.includes('responsible ai')) {
      errorType = 'content_violation';
      errorMessage = 'Blocked by content safety filters. Try rephrasing your prompt.';
      return { errorType, errorMessage, debugDetail };
    }
    if (lower.includes('invalid_argument') || lower.includes('invalid argument') || lower.includes('unable to process input image')) {
      errorType = 'invalid_input_image';
      errorMessage = "The source image couldn't be processed. Try a different image or re-upload.";
      return { errorType, errorMessage, debugDetail };
    }
  } catch {
    // not JSON
  }

  if (status === 429) {
    errorType = 'rate_limit';
    errorMessage = 'Too many image requests. Please wait a moment and try again.';
  } else if (status === 402) {
    errorType = 'payment_required';
    errorMessage = 'Image generation credits exhausted. Please add credits.';
  } else if (status === 400 && errorType === 'unknown') {
    errorType = 'invalid_request';
    errorMessage = `Invalid request: ${debugDetail.slice(0, 200)}`;
  } else if (status >= 500) {
    errorType = 'provider_error';
    errorMessage = `Image model error: ${debugDetail.slice(0, 200)}`;
  }

  return { errorType, errorMessage, debugDetail };
}

function buildEditPrompt(userPrompt: string, imageCount: number): string {
  const lowerPrompt = userPrompt.toLowerCase();
  let finalPrompt = '';

  if (imageCount > 1) {
    finalPrompt += "Combine or merge the provided images based on the instruction. ";
  }

  const isPortrait = lowerPrompt.includes('same person') ||
                    lowerPrompt.includes('my face') ||
                    lowerPrompt.includes('selfie') ||
                    lowerPrompt.includes('headshot') ||
                    lowerPrompt.includes('portrait') ||
                    lowerPrompt.includes('look like me') ||
                    lowerPrompt.includes('me,') ||
                    lowerPrompt.includes('me ');

  if (isPortrait) {
    finalPrompt += "Keep the same person and preserve facial identity. Maintain the face exactly as in the source image.\n\n";
  }

  const keepMatches = userPrompt.match(/keep\s+(the\s+)?([^,.!?]+)/gi);
  if (keepMatches && keepMatches.length > 0) {
    const preserveItems = keepMatches.map(match =>
      match.replace(/keep\s+(the\s+)?/i, '').trim()
    ).join(', ');
    finalPrompt += `Preserve these elements: ${preserveItems}.\n\n`;
  }

  finalPrompt += userPrompt;
  return finalPrompt;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: 'Missing authorization header' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const token = authHeader.replace('Bearer ', '');
  const supabaseAuth = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);

  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: 'Invalid or expired token' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { prompt, baseImageUrl, baseImageUrls, imageModel, aspectRatio } = await req.json();

    if (!prompt) {
      return new Response(
        JSON.stringify({ error: 'Prompt is required', errorType: 'invalid_request', success: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      console.error('LOVABLE_API_KEY not found');
      return new Response(
        JSON.stringify({ error: 'Lovable API key not configured', errorType: 'provider_error', success: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const imageArray = baseImageUrls || (baseImageUrl ? [baseImageUrl] : []);

    if (imageArray.length === 0) {
      return new Response(
        JSON.stringify({ error: 'At least one base image URL is required for editing', errorType: 'invalid_request', success: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    if (imageArray.length > 14) {
      return new Response(
        JSON.stringify({ error: 'Maximum 14 images allowed for combining', errorType: 'invalid_request', success: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Validate no blob: URLs (unusable server-side)
    const blobUrls = imageArray.filter((url: string) => url.startsWith('blob:'));
    if (blobUrls.length > 0) {
      console.error('Received blob: URLs which are unusable server-side:', blobUrls.length);
      return new Response(JSON.stringify({
        error: "The source image couldn't be processed. Try re-uploading or using a different image.",
        errorType: 'invalid_input_image',
        debugDetail: `Received ${blobUrls.length} blob: URL(s) which are browser-local and unusable server-side`,
        success: false
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Queuing image edit/combine with prompt:', prompt);
    console.log('Number of images:', imageArray.length);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Create a job record in the database
    const { data: jobData, error: jobError } = await supabase
      .from('image_generation_jobs')
      .insert({
        user_id: user.id,
        job_type: 'edit',
        prompt,
        base_image_urls: imageArray,
        aspect_ratio: aspectRatio || '16:9',
        preferred_model: imageModel,
        status: 'pending'
      })
      .select('id')
      .single();

    if (jobError || !jobData) {
      console.error('Failed to create edit job:', jobError);
      return new Response(JSON.stringify({
        error: 'Failed to queue image editing',
        errorType: 'queue_error',
        success: false
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Image edit job created:', jobData.id);
    return new Response(
      JSON.stringify({
        jobId: jobData.id,
        status: 'pending',
        success: true,
        message: 'Image edit queued. You can close this tab and check back later.'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in edit-image function:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({
      error: message,
      errorType: 'provider_error',
      success: false
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Worker function to process pending edit jobs
export async function processImageEditJobs() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

  if (!lovableApiKey) {
    console.error('LOVABLE_API_KEY not configured');
    return;
  }

  // Get next pending edit job
  const { data: jobs, error: fetchError } = await supabase
    .from('image_generation_jobs')
    .select('*')
    .eq('job_type', 'edit')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1);

  if (fetchError) {
    console.error('Error fetching pending edit jobs:', fetchError);
    return;
  }

  if (!jobs || jobs.length === 0) {
    return;
  }

  const job = jobs[0];
  console.log('Processing edit job:', job.id);

  try {
    // Mark as processing
    await supabase
      .from('image_generation_jobs')
      .update({ status: 'processing', last_attempt_at: new Date().toISOString() })
      .eq('id', job.id);

    const selectedModel = 'google/gemini-3.1-flash-image-preview';
    const editPrompt = buildEditPrompt(job.prompt, job.base_image_urls?.length || 0);
    const finalAspectRatio = job.aspect_ratio || '16:9';
    const aspectPrompt = `Output the image in ${finalAspectRatio} aspect ratio. ${editPrompt}`;

    const contentArray: any[] = [
      { type: 'text', text: aspectPrompt }
    ];

    (job.base_image_urls || []).forEach((url: string) => {
      contentArray.push({ type: 'image_url', image_url: { url } });
    });

    const requestBody = JSON.stringify({
      model: selectedModel,
      messages: [{ role: 'user', content: contentArray }],
      modalities: ['image', 'text']
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 55000);

    let response: Response;
    try {
      response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: requestBody,
        signal: controller.signal,
      });
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      if (fetchErr.name === 'AbortError') {
        const { errorType, errorMessage } = classifyError(408, 'Request timeout');
        await supabase
          .from('image_generation_jobs')
          .update({
            status: 'failed',
            error_message: errorMessage,
            error_type: errorType,
            attempts: (job.attempts || 0) + 1
          })
          .eq('id', job.id);
        return;
      }
      throw fetchErr;
    }
    clearTimeout(timeoutId);

    // Retry once on 429 after 3s
    if (response.status === 429) {
      console.log('Rate limited, retrying after 3s...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      const retryController = new AbortController();
      const retryTimeoutId = setTimeout(() => retryController.abort(), 55000);
      try {
        response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableApiKey}`,
            'Content-Type': 'application/json',
          },
          body: requestBody,
          signal: retryController.signal,
        });
      } catch (retryErr: any) {
        clearTimeout(retryTimeoutId);
        if (retryErr.name === 'AbortError') {
          const { errorType, errorMessage } = classifyError(408, 'Retry timeout');
          await supabase
            .from('image_generation_jobs')
            .update({
              status: 'failed',
              error_message: errorMessage,
              error_type: errorType,
              attempts: (job.attempts || 0) + 1
            })
            .eq('id', job.id);
          return;
        }
        throw retryErr;
      }
      clearTimeout(retryTimeoutId);
    }

    if (!response.ok) {
      const errorData = await response.text();
      const { errorType, errorMessage } = classifyError(response.status, errorData);

      await supabase
        .from('image_generation_jobs')
        .update({
          status: 'failed',
          error_message: errorMessage,
          error_type: errorType,
          attempts: (job.attempts || 0) + 1
        })
        .eq('id', job.id);
      return;
    }

    let data: any;
    try {
      const rawText = await response.text();
      if (!rawText || rawText.trim() === '') {
        await supabase
          .from('image_generation_jobs')
          .update({
            status: 'failed',
            error_message: 'Empty response from model',
            error_type: 'empty_response',
            attempts: (job.attempts || 0) + 1
          })
          .eq('id', job.id);
        return;
      }
      data = JSON.parse(rawText);
    } catch (parseErr) {
      await supabase
        .from('image_generation_jobs')
        .update({
          status: 'failed',
          error_message: 'Failed to parse model response',
          error_type: 'parse_error',
          attempts: (job.attempts || 0) + 1
        })
        .eq('id', job.id);
      return;
    }

    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!imageUrl) {
      await supabase
        .from('image_generation_jobs')
        .update({
          status: 'failed',
          error_message: 'No image returned from model',
          error_type: 'no_image_returned',
          attempts: (job.attempts || 0) + 1
        })
        .eq('id', job.id);
      return;
    }

    // Success!
    await supabase
      .from('image_generation_jobs')
      .update({
        status: 'completed',
        result_image_url: imageUrl
      })
      .eq('id', job.id);

    console.log('Edit job completed:', job.id);
  } catch (error) {
    console.error('Error processing edit job:', error);
    await supabase
      .from('image_generation_jobs')
      .update({
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
        error_type: 'processing_error',
        attempts: (job.attempts || 0) + 1
      })
      .eq('id', job.id);
  }
}
