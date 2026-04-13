import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function classifyError(status: number, rawText: string): { errorType: string; errorMessage: string; debugDetail: string } {
  let debugDetail = rawText;
  let errorType = 'unknown';
  let errorMessage = 'Image generation failed. Please try again.';

  // Try parsing JSON for richer detail
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
    if (lower.includes('invalid_argument') || lower.includes('invalid argument')) {
      errorType = 'invalid_request';
      errorMessage = `Invalid request: ${debugDetail.slice(0, 200)}`;
      return { errorType, errorMessage, debugDetail };
    }
  } catch {
    // not JSON, use raw text
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
    const { prompt, preferredModel, aspectRatio } = await req.json();
    console.log('Queuing image generation with prompt:', prompt);
    console.log('Aspect ratio:', aspectRatio);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Create a job record in the database
    const { data: jobData, error: jobError } = await supabase
      .from('image_generation_jobs')
      .insert({
        user_id: user.id,
        job_type: 'generate',
        prompt,
        aspect_ratio: aspectRatio || '16:9',
        preferred_model: preferredModel,
        status: 'pending'
      })
      .select('id')
      .single();

    if (jobError || !jobData) {
      console.error('Failed to create job:', jobError);
      return new Response(JSON.stringify({
        error: 'Failed to queue image generation',
        errorType: 'queue_error',
        success: false
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Image generation job created:', jobData.id);

    // Process the job inline since there's no separate cron worker
    const jobId = jobData.id;

    // Mark as processing
    await supabase.from('image_generation_jobs')
      .update({ status: 'processing', last_attempt_at: new Date().toISOString() })
      .eq('id', jobId);

    const imageModel = 'google/gemini-3.1-flash-image-preview';
    const finalAspectRatio = aspectRatio || '16:9';
    const enhancedPrompt = `Generate this image in ${finalAspectRatio} aspect ratio: ${prompt}`;

    const requestBody = JSON.stringify({
      model: imageModel,
      messages: [{ role: 'user', content: enhancedPrompt }],
      modalities: ['image', 'text']
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 55000);

    let aiResponse: Response;
    try {
      aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
      const isTimeout = fetchErr.name === 'AbortError';
      const { errorType: et, errorMessage: em } = classifyError(isTimeout ? 408 : 500, isTimeout ? 'Request timeout' : fetchErr.message);
      await supabase.from('image_generation_jobs')
        .update({ status: 'failed', error_message: em, error_type: et, attempts: 1 })
        .eq('id', jobId);
      return new Response(JSON.stringify({ jobId, status: 'failed', error: em, errorType: et, success: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    clearTimeout(timeoutId);

    // Retry once on 429
    if (aiResponse.status === 429) {
      console.log('Rate limited, retrying after 3s...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      const retryController = new AbortController();
      const retryTimeout = setTimeout(() => retryController.abort(), 55000);
      try {
        aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${lovableApiKey}`, 'Content-Type': 'application/json' },
          body: requestBody,
          signal: retryController.signal,
        });
      } catch (retryErr: any) {
        clearTimeout(retryTimeout);
        const { errorType: et, errorMessage: em } = classifyError(429, 'Rate limit retry failed');
        await supabase.from('image_generation_jobs')
          .update({ status: 'failed', error_message: em, error_type: et, attempts: 1 })
          .eq('id', jobId);
        return new Response(JSON.stringify({ jobId, status: 'failed', error: em, errorType: et, success: false }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      clearTimeout(retryTimeout);
    }

    if (!aiResponse.ok) {
      const errorData = await aiResponse.text();
      const { errorType: et, errorMessage: em } = classifyError(aiResponse.status, errorData);
      await supabase.from('image_generation_jobs')
        .update({ status: 'failed', error_message: em, error_type: et, attempts: 1 })
        .eq('id', jobId);
      return new Response(JSON.stringify({ jobId, status: 'failed', error: em, errorType: et, success: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let data: any;
    try {
      const rawText = await aiResponse.text();
      if (!rawText || rawText.trim() === '') {
        await supabase.from('image_generation_jobs')
          .update({ status: 'failed', error_message: 'Empty response from model', error_type: 'empty_response', attempts: 1 })
          .eq('id', jobId);
        return new Response(JSON.stringify({ jobId, status: 'failed', error: 'Empty response from model', errorType: 'empty_response', success: false }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      data = JSON.parse(rawText);
    } catch {
      await supabase.from('image_generation_jobs')
        .update({ status: 'failed', error_message: 'Failed to parse model response', error_type: 'parse_error', attempts: 1 })
        .eq('id', jobId);
      return new Response(JSON.stringify({ jobId, status: 'failed', error: 'Failed to parse response', errorType: 'parse_error', success: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!imageUrl) {
      await supabase.from('image_generation_jobs')
        .update({ status: 'failed', error_message: 'No image returned from model', error_type: 'no_image_returned', attempts: 1 })
        .eq('id', jobId);
      return new Response(JSON.stringify({ jobId, status: 'failed', error: 'No image returned', errorType: 'no_image_returned', success: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Success
    await supabase.from('image_generation_jobs')
      .update({ status: 'completed', result_image_url: imageUrl })
      .eq('id', jobId);

    console.log('Job completed inline:', jobId);
    return new Response(JSON.stringify({
      jobId,
      status: 'completed',
      imageUrl,
      success: true
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error: unknown) {
    console.error('Error in generate-image function:', error);
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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

  if (!lovableApiKey) {
    console.error('LOVABLE_API_KEY not configured');
    return;
  }

  // Get next pending job
  const { data: jobs, error: fetchError } = await supabase
    .from('image_generation_jobs')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1);

  if (fetchError) {
    console.error('Error fetching pending jobs:', fetchError);
    return;
  }

  if (!jobs || jobs.length === 0) {
    console.log('No pending jobs');
    return;
  }

  const job = jobs[0];
  console.log('Processing job:', job.id);

  try {
    // Mark as processing
    await supabase
      .from('image_generation_jobs')
      .update({ status: 'processing', last_attempt_at: new Date().toISOString() })
      .eq('id', job.id);

    const imageModel = 'google/gemini-3.1-flash-image-preview';
    const finalAspectRatio = job.aspect_ratio || '16:9';
    let enhancedPrompt = `Generate this image in ${finalAspectRatio} aspect ratio: ${job.prompt}`;

    const requestBody = JSON.stringify({
      model: imageModel,
      messages: [{ role: 'user', content: enhancedPrompt }],
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

    console.log('Job completed:', job.id);
  } catch (error) {
    console.error('Error processing job:', error);
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
