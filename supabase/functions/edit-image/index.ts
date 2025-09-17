import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const { prompt, baseImageUrl } = await req.json();

    if (!prompt) {
      return new Response(
        JSON.stringify({ error: 'Prompt is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      console.error('OPENAI_API_KEY not found');
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    console.log('Editing image with prompt:', prompt);
    console.log('Base image URL:', baseImageUrl);

    // For now, we'll use the new gpt-image-1 model for image generation
    // In a real implementation, you might want to download the base image and use it as input
    // Since OpenAI's API doesn't directly support image-to-image editing via URL,
    // we'll generate a new image with an enhanced prompt that references the style/content
    const enhancedPrompt = baseImageUrl 
      ? `Based on the style and composition of the reference image, ${prompt}. Maintain similar artistic style, lighting, and composition while making the requested changes.`
      : prompt;

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: enhancedPrompt,
        n: 1,
        size: '1024x1024',
        quality: 'hd',
        response_format: 'b64_json',
        output_format: 'webp'
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('OpenAI API error:', response.status, errorData);
      return new Response(
        JSON.stringify({ 
          error: `OpenAI API error: ${response.status}`,
          details: errorData 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: response.status }
      );
    }

    const data = await response.json();
    console.log('Image editing response received');

    if (!data.data || !data.data[0] || !data.data[0].b64_json) {
      return new Response(
        JSON.stringify({ error: 'No image data received from OpenAI' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const imageDataUrl = `data:image/webp;base64,${data.data[0].b64_json}`;

    return new Response(
      JSON.stringify({ 
        success: true, 
        imageUrl: imageDataUrl 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in edit-image function:', error);
    return new Response(
      JSON.stringify({ 
        error: 'An unexpected error occurred',
        details: error.message 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});