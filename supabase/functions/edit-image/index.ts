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

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      console.error('LOVABLE_API_KEY not found');
      return new Response(
        JSON.stringify({ error: 'Lovable API key not configured' }),
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
        finalPrompt += "Keep the same person and preserve facial identity. Maintain the face exactly as in the source image.\n\n";
      }
      
      // Check for explicit preservation requests
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

    const editPrompt = buildEditPrompt(prompt);
    console.log('Edit prompt:', editPrompt);

    // Use Gemini image generation with the base image
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
            content: [
              { type: 'text', text: editPrompt },
              { type: 'image_url', image_url: { url: baseImageUrl } }
            ]
          }
        ],
        modalities: ['image', 'text']
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Lovable AI error:', response.status, errorData);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 429 }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required. Please add credits to your Lovable workspace.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 402 }
        );
      }
      
      return new Response(
        JSON.stringify({ 
          error: `Lovable AI error: ${response.status}`,
          details: errorData 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: response.status }
      );
    }

    const data = await response.json();
    console.log('Image editing response received');

    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: 'No image data received from Lovable AI' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        imageUrl: imageUrl 
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