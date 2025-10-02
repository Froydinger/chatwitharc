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
    const { prompt, baseImageUrl, operation } = await req.json();

    if (!prompt) {
      return new Response(
        JSON.stringify({ error: 'Prompt is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log('Operation type:', operation);
    console.log('Editing image with prompt:', prompt);
    console.log('Base image URL:', baseImageUrl);

    // Handle multi-image combination
    if (operation === 'combine' && Array.isArray(baseImageUrl)) {
      console.log('Combining multiple images:', baseImageUrl.length);
      
      // For multi-image, use the Lovable AI Gateway to generate a new image based on all the source images
      const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
      if (!LOVABLE_API_KEY) {
        return new Response(
          JSON.stringify({ error: 'LOVABLE_API_KEY not configured' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // Build the content array with text prompt and all images
      const content: any[] = [
        {
          type: "text",
          text: `Combine and merge these images together according to this instruction: ${prompt}`
        }
      ];

      // Add all images to the content
      for (const imageUrl of baseImageUrl) {
        content.push({
          type: "image_url",
          image_url: {
            url: imageUrl
          }
        });
      }

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image-preview",
          messages: [
            {
              role: "user",
              content: content
            }
          ],
          modalities: ["image", "text"]
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Lovable AI error:', response.status, errorData);
        return new Response(
          JSON.stringify({ 
            error: `Image combination error: ${response.status}`,
            details: errorData 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: response.status }
        );
      }

      const data = await response.json();
      const combinedImageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

      if (!combinedImageUrl) {
        return new Response(
          JSON.stringify({ error: 'No combined image data received' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          imageUrl: combinedImageUrl 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Single image editing - use Gemini
    const singleImageUrl = Array.isArray(baseImageUrl) ? baseImageUrl[0] : baseImageUrl;
    
    if (!singleImageUrl) {
      return new Response(
        JSON.stringify({ error: 'Base image URL is required for editing' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log('Editing single image with Gemini');
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'LOVABLE_API_KEY not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image-preview",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Edit this image according to this instruction: ${prompt}`
              },
              {
                type: "image_url",
                image_url: {
                  url: singleImageUrl
                }
              }
            ]
          }
        ],
        modalities: ["image", "text"]
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Lovable AI error:', response.status, errorData);
      return new Response(
        JSON.stringify({ 
          error: `Image editing error: ${response.status}`,
          details: errorData 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: response.status }
      );
    }

    const data = await response.json();
    const editedImageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!editedImageUrl) {
      return new Response(
        JSON.stringify({ error: 'No edited image data received' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        imageUrl: editedImageUrl 
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