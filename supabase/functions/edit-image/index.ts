import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

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
    const { prompt, baseImageUrl, baseImageUrls, imageModel } = await req.json();

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

    // Use provided model or default to Gemini 3 Pro
    const selectedModel = imageModel || 'google/gemini-3-pro-image-preview';
    console.log('Using image model:', selectedModel);

    // Support both single image and multiple images (up to 2 for combining)
    const imageArray = baseImageUrls || (baseImageUrl ? [baseImageUrl] : []);
    
    if (imageArray.length === 0) {
      return new Response(
        JSON.stringify({ error: 'At least one base image URL is required for editing' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    if (imageArray.length > 14) {
      return new Response(
        JSON.stringify({ error: 'Maximum 14 images allowed for combining' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log('Editing/combining images with prompt:', prompt);
    console.log('Number of images:', imageArray.length);

    // Build smart prompt with identity preservation
    function buildEditPrompt(userPrompt: string, imageCount: number): string {
      const lowerPrompt = userPrompt.toLowerCase();
      let finalPrompt = '';
      
      // Check if this is a combining request
      if (imageCount > 1) {
        finalPrompt += "Combine or merge the provided images based on the instruction. ";
      }
      
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

    const editPrompt = buildEditPrompt(prompt, imageArray.length);

    // Append restrictions to prompt if they exist
    const enhancedEditPrompt = imageRestrictions
      ? `${editPrompt}\n\nIMPORTANT RESTRICTIONS: ${imageRestrictions}`
      : editPrompt;
    
    // Add watermark instruction to prompt
    const finalEditPrompt = `${enhancedEditPrompt}\n\nIMPORTANT: Add a very small watermark in the bottom-right corner of the actual image (not on objects within the scene, but overlaid on the image itself like a photo watermark). The watermark should be the text "ArcAi" in sans-serif font, where "Arc" is rendered in ultra-thin font weight and "Ai" is rendered in regular thin font weight. Make it white at only 10% opacity (very subtle and barely visible). Keep it very small.`;

    console.log('Edit/combine prompt with restrictions:', finalEditPrompt);

    // Build content array with text and all images
    const contentArray: any[] = [
      { type: 'text', text: finalEditPrompt }
    ];
    
    // Add all images to the content array
    imageArray.forEach((url: string) => {
      contentArray.push({ type: 'image_url', image_url: { url } });
    });

    // Use Gemini image generation with the base image(s)
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          {
            role: 'user',
            content: contentArray
          }
        ],
        modalities: ['image', 'text']
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Lovable AI error:', response.status, errorData);
      
      // Parse error response to get detailed error information
      let errorMessage = 'Failed to edit image';
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
          errorMessage = 'Image edit blocked due to content policy violation. Please try a different prompt or image.';
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
        errorMessage = 'Image edit blocked. The request may violate content policies.';
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
        imageUrl: imageUrl,
        model: selectedModel
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