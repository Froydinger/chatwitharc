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
    console.log('Generating image with prompt:', prompt);
    console.log('Aspect ratio:', aspectRatio);

    if (!lovableApiKey) {
      throw new Error('Lovable API key not configured');
    }

    const imageModel = 'google/gemini-3-pro-image-preview';
    console.log('Using image model:', imageModel);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: settingsData } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'image_restrictions')
      .maybeSingle();

    const imageRestrictions = settingsData?.value || '';

    const finalAspectRatio = aspectRatio || '16:9';
    let enhancedPrompt = `Generate this image in ${finalAspectRatio} aspect ratio: ${prompt}`;

    const finalPrompt = imageRestrictions
      ? `${enhancedPrompt}\n\nIMPORTANT RESTRICTIONS: ${imageRestrictions}`
      : enhancedPrompt;

    console.log('Enhanced prompt with restrictions:', finalPrompt);

    // AbortController with 55-second timeout
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
        body: JSON.stringify({
          model: imageModel,
          messages: [{ role: 'user', content: finalPrompt }],
          modalities: ['image', 'text']
        }),
        signal: controller.signal,
      });
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      if (fetchErr.name === 'AbortError') {
        return new Response(JSON.stringify({
          error: 'Image generation timed out. Try a simpler prompt or try again.',
          errorType: 'timeout',
          debugDetail: 'Request aborted after 55s timeout',
          success: false
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw fetchErr;
    }
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Lovable AI error:', response.status, errorData);

      const { errorType, errorMessage, debugDetail } = classifyError(response.status, errorData);

      return new Response(JSON.stringify({
        error: errorMessage,
        errorType,
        debugDetail,
        success: false
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    console.log('Image generation response received');

    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!imageUrl) {
      return new Response(JSON.stringify({
        error: 'The model responded but produced no image. Please try again.',
        errorType: 'no_image_returned',
        debugDetail: JSON.stringify(data.choices?.[0]?.message || {}),
        success: false
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ 
      imageUrl,
      model: imageModel,
      success: true 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error in generate-image function:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      error: message,
      errorType: 'provider_error',
      debugDetail: message,
      success: false 
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
