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

    if (!baseImageUrl) {
      return new Response(
        JSON.stringify({ error: 'Base image URL is required for editing' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // First, download the base image and convert to base64
    let baseImageBase64;
    try {
      const imageResponse = await fetch(baseImageUrl);
      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch image: ${imageResponse.status}`);
      }
      const imageBuffer = await imageResponse.arrayBuffer();
      baseImageBase64 = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));
    } catch (error) {
      console.error('Error downloading base image:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to download base image' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // First, analyze the image to understand what we're editing
    const visionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 300,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Describe this image in detail, focusing on the subject, pose, clothing, background, lighting, and artistic style. I want to edit it with this instruction: "${prompt}". Provide a detailed description that will help recreate this exact image with the requested modifications.`
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/webp;base64,${baseImageBase64}`
                }
              }
            ]
          }
        ]
      }),
    });

    if (!visionResponse.ok) {
      const errorData = await visionResponse.text();
      console.error('Vision API error:', visionResponse.status, errorData);
      return new Response(
        JSON.stringify({ error: 'Failed to analyze base image' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const visionData = await visionResponse.json();
    const imageDescription = visionData.choices[0].message.content;
    console.log('Image analysis:', imageDescription);

    // Now generate a new image based on the description and edit instruction
    const enhancedPrompt = `${imageDescription}\n\nNow modify this image: ${prompt}. Keep everything else exactly the same - same pose, same background, same lighting, same artistic style. Only make the specific requested changes.`;

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
        quality: 'high',
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