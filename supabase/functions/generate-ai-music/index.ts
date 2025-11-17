import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const sunoApiKey = Deno.env.get('SUNO_API_KEY');

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
    const { prompt, instrumental, style, poll, taskIds } = await req.json();

    if (!sunoApiKey) {
      throw new Error('Suno API key not configured');
    }

    // Handle polling requests
    if (poll && taskIds) {
      console.log('Polling for task IDs:', taskIds);
      const response = await fetch(`https://api.sunoapi.org/api/v1/query?ids=${taskIds.join(',')}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${sunoApiKey}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Polling error:', response.status, errorData);
        return new Response(JSON.stringify({
          error: 'Failed to poll music status',
          success: false
        }), {
          status: response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const data = await response.json();
      return new Response(JSON.stringify({
        data: data,
        success: true
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate music
    console.log('Generating AI music with prompt:', prompt);

    // Generate title from prompt (first 50 chars)
    const title = prompt.substring(0, 50);

    // Call Suno API to generate music
    const response = await fetch('https://api.sunoapi.org/api/v1/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sunoApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: prompt,
        title: title,
        customMode: true,
        instrumental: instrumental || false,
        model: "V5", // Latest Suno model - superior musical expression
        callBackUrl: "https://placeholder.callback.url", // Required by API but we poll instead
        ...(style && { style: style }), // Only include style if provided
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Suno API error:', response.status, errorData);

      let errorMessage = 'Failed to generate music';
      let errorType = 'unknown';

      try {
        const errorJson = JSON.parse(errorData);
        errorMessage = errorJson.error?.message || errorJson.message || errorData;
      } catch (e) {
        // If parsing fails, use status-based error
      }

      if (response.status === 429) {
        errorType = 'rate_limit';
        errorMessage = 'Rate limit exceeded. Please try again later.';
      } else if (response.status === 402 || response.status === 403) {
        errorType = 'payment_required';
        errorMessage = 'API credits required. Please check your Suno API account.';
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
    console.log('Music generation response received:', data);

    return new Response(JSON.stringify({
      data: data,
      success: true
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in generate-ai-music function:', error);
    return new Response(JSON.stringify({
      error: error.message,
      success: false
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
