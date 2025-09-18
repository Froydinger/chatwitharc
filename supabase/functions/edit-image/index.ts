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
      // Convert to base64 without stack overflow for large images
      const uint8Array = new Uint8Array(imageBuffer);
      let binaryString = '';
      for (let i = 0; i < uint8Array.length; i++) {
        binaryString += String.fromCharCode(uint8Array[i]);
      }
      baseImageBase64 = btoa(binaryString);
    } catch (error) {
      console.error('Error downloading base image:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to download base image' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // Build smart prompt with identity preservation
    function buildEditPrompt(userPrompt: string): string {
      const lowerPrompt = userPrompt.toLowerCase();
      let finalPrompt = '';
      
      // Check if this looks like a portrait/face edit
      const isPortrait = lowerPrompt.includes('same person') || 
                        lowerPrompt.includes('my face') || 
                        lowerPrompt.includes('selfie') || 
                        lowerPrompt.includes('headshot') || 
                        lowerPrompt.includes('portrait') || 
                        lowerPrompt.includes('look like me') ||
                        lowerPrompt.includes('me,') ||
                        lowerPrompt.includes('me ');
      
      if (isPortrait) {
        finalPrompt += "Same person. Preserve facial identity. Keep the same face exactly as in the source image. Do not alter eye shape, nose width, mouth corners, hairline, or overall face geometry. Keep the pose and camera angle unless requested.\n\n";
      }
      
      // Check for explicit preservation requests
      const keepMatches = userPrompt.match(/keep\s+(the\s+)?([^,.!?]+)/gi);
      if (keepMatches && keepMatches.length > 0) {
        const preserveItems = keepMatches.map(match => 
          match.replace(/keep\s+(the\s+)?/i, '').trim()
        ).join(', ');
        finalPrompt += `Preserve the following elements exactly as in the source image: ${preserveItems}. Do not alter their shape, color, or proportions.\n\n`;
      } else if (!isPortrait) {
        // Default preservation for non-portrait images
        finalPrompt += "Preserve the main subject's proportions and geometry. Avoid altering recognizable identity features.\n\n";
      }
      
      // Add the user's actual edit request
      finalPrompt += userPrompt;
      
      return finalPrompt;
    }

    const editPrompt = buildEditPrompt(prompt);
    console.log('Edit prompt:', editPrompt);

    // Use image edits endpoint with gpt-image-1
    const formData = new FormData();
    
    // Convert base64 back to blob for the API
    const imageBlob = new Blob([
      new Uint8Array(
        atob(baseImageBase64)
          .split('')
          .map(char => char.charCodeAt(0))
      )
    ], { type: 'image/webp' });
    
    formData.append('image', imageBlob, 'image.webp');
    formData.append('model', 'gpt-image-1');
    formData.append('prompt', editPrompt);
    formData.append('size', '1024x1024');
    formData.append('output_format', 'webp');
    formData.append('quality', 'high');

    const response = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: formData,
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