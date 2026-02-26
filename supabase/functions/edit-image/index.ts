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

    const selectedModel = 'google/gemini-3-pro-image-preview';
    console.log('Using image model:', selectedModel);

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

    console.log('Editing/combining images with prompt:', prompt);
    console.log('Number of images:', imageArray.length);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: settingsData } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'image_restrictions')
      .maybeSingle();

    const imageRestrictions = settingsData?.value || '';
    const editPrompt = buildEditPrompt(prompt, imageArray.length);

    const finalAspectRatio = aspectRatio || '16:9';
    const aspectPrompt = `Output the image in ${finalAspectRatio} aspect ratio. ${editPrompt}`;

    const finalEditPrompt = imageRestrictions
      ? `${aspectPrompt}\n\nIMPORTANT RESTRICTIONS: ${imageRestrictions}`
      : aspectPrompt;

    console.log('Edit/combine prompt with restrictions:', finalEditPrompt);

    const contentArray: any[] = [
      { type: 'text', text: finalEditPrompt }
    ];
    
    imageArray.forEach((url: string) => {
      contentArray.push({ type: 'image_url', image_url: { url } });
    });

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
          model: selectedModel,
          messages: [{ role: 'user', content: contentArray }],
          modalities: ['image', 'text']
        }),
        signal: controller.signal,
      });
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      if (fetchErr.name === 'AbortError') {
        return new Response(JSON.stringify({
          error: 'Image editing timed out. Try a simpler prompt or try again.',
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
    console.log('Image editing response received');

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

    return new Response(
      JSON.stringify({ success: true, imageUrl, model: selectedModel }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in edit-image function:', error);
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
