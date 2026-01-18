import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Verify authentication
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
    const { prompt, preferredModel } = await req.json();
    console.log('Generating image with prompt:', prompt);
    console.log('Preferred model:', preferredModel);

    if (!lovableApiKey) {
      throw new Error('Lovable API key not configured');
    }

    // Default to Pro image model for best quality
    // Only use Flash if explicitly requested (e.g., "fast" option in editor)
    // google/gemini-2.5-flash-image = fast/quick option
    // google/gemini-3-pro-image-preview = default high quality
    const imageModel = preferredModel === 'google/gemini-2.5-flash-image' || preferredModel === 'google/gemini-3-flash-preview'
      ? 'google/gemini-2.5-flash-image'
      : 'google/gemini-3-pro-image-preview';
    
    console.log('Using image model:', imageModel);

    // Get Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch image restrictions from admin settings
    const { data: settingsData } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'image_restrictions')
      .maybeSingle();

    const imageRestrictions = settingsData?.value || '';

    // Append restrictions to prompt if they exist
    const finalPrompt = imageRestrictions
      ? `${prompt}\n\nIMPORTANT RESTRICTIONS: ${imageRestrictions}`
      : prompt;

    console.log('Enhanced prompt with restrictions:', finalPrompt);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: imageModel,
        messages: [
          {
            role: 'user',
            content: finalPrompt
          }
        ],
        modalities: ['image', 'text']
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Lovable AI error:', response.status, errorData);
      
      // Parse error response to get detailed error information
      let errorMessage = 'Failed to generate image';
      let errorType = 'unknown';
      
      try {
        const errorJson = JSON.parse(errorData);
        const detailedError = errorJson.error?.message || errorJson.message || errorData;
        
        // Check for content safety violations
        if (detailedError.toLowerCase().includes('safety') || 
            detailedError.toLowerCase().includes('content policy') ||
            detailedError.toLowerCase().includes('content violation') ||
            detailedError.toLowerCase().includes('blocked')) {
          errorType = 'content_violation';
          errorMessage = 'Image generation blocked due to content policy violation. Please try a different prompt.';
        }
      } catch (e) {
        // If error parsing fails, check status codes
      }
      
      if (response.status === 429) {
        errorType = 'rate_limit';
        errorMessage = 'Rate limit exceeded. Please try again later.';
      } else if (response.status === 402) {
        errorType = 'payment_required';
        errorMessage = 'Payment required. Please add credits to your Lovable workspace.';
      } else if (response.status === 400 && errorType === 'unknown') {
        // 400 often indicates content issues
        errorType = 'content_violation';
        errorMessage = 'Image generation blocked. The prompt may violate content policies.';
      }
      
      return new Response(JSON.stringify({
        error: errorMessage,
        errorType: errorType,
        success: false
      }), {
        status: 200, // Always return 200 so Supabase client can parse the error details
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    console.log('Image generation response received');

    // Extract base64 image from Gemini response
    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!imageUrl) {
      throw new Error('No image data received from Lovable AI');
    }

    return new Response(JSON.stringify({ 
      imageUrl: imageUrl,
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
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});