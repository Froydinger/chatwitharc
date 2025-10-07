import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

  try {
    const { prompt } = await req.json();
    console.log('Generating image with prompt:', prompt);

    if (!lovableApiKey) {
      throw new Error('Lovable API key not configured');
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-image-preview',
        messages: [
          {
            role: 'user',
            content: prompt
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
        status: response.status,
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
      success: true 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in generate-image function:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});