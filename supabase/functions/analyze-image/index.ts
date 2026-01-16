import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('Image analysis request received');
  
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
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.39.3');
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: 'Invalid or expired token' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (!lovableApiKey) {
    console.error('Lovable API key not found');
    return new Response(JSON.stringify({ error: 'Lovable API key not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { messages, image, images, model } = await req.json();

    // Support both single image and multiple images (up to 4)
    const imageArray = images || (image ? [image] : []);
    
    if (!messages) {
      return new Response(JSON.stringify({ error: 'Messages are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    if (imageArray.length === 0) {
      return new Response(JSON.stringify({ error: 'At least one image is required for analysis' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (imageArray.length > 4) {
      return new Response(JSON.stringify({ error: 'Maximum 4 images allowed for analysis' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Analyzing images count:', imageArray.length);

    // Build content array with text and all images
    const lastMessage = messages[messages.length - 1];
    const contentArray: any[] = [
      { type: 'text', text: lastMessage?.content || 'What do you see in these images?' }
    ];
    
    // Add all images to the content array
    imageArray.forEach((img: string) => {
      contentArray.push({ type: 'image_url', image_url: { url: img } });
    });

    // Use passed model for vision capabilities (defaults to Gemini 3 Flash)
    const selectedModel = model || 'google/gemini-3-flash-preview';
    console.log('Using model for image analysis:', selectedModel);
    
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
            role: 'system',
            content: 'You are ArcAI. Analyze images quickly and concisely. Be helpful but brief. When multiple images are provided, analyze each one and describe relationships between them if relevant.'
          },
          ...messages.slice(0, -1), // Include previous messages but not the last one
          {
            role: 'user',
            content: contentArray
          }
        ]
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Lovable AI error:', errorData);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({
          error: 'Rate limit exceeded. Please try again later.',
          success: false
        }), {
          status: 200, // Always return 200 so Supabase client can parse the error details
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({
          error: 'Payment required. Please add credits to your Lovable workspace.',
          success: false
        }), {
          status: 200, // Always return 200 so Supabase client can parse the error details
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      return new Response(JSON.stringify({
        error: `Image analysis failed: ${response.status} ${response.statusText}`,
        success: false
      }), {
        status: 200, // Always return 200 so Supabase client can parse the error details
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    console.log('Image analysis successful');

    return new Response(JSON.stringify({ 
      content: data.choices[0]?.message?.content || 'Sorry, I could not analyze the image.',
      success: true 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error in analyze-image function:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});