import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Replicate from "https://esm.sh/replicate@0.25.2";

const replicateApiKey = Deno.env.get('REPLICATE_API_KEY');

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
    const { prompt, predictionId, duration } = await req.json();

    if (!replicateApiKey) {
      throw new Error('REPLICATE_API_KEY is not configured');
    }

    const replicate = new Replicate({
      auth: replicateApiKey,
    });

    // Handle polling for prediction status
    if (predictionId) {
      console.log('Checking status for prediction:', predictionId);
      const prediction = await replicate.predictions.get(predictionId);
      console.log('Prediction status:', prediction.status);
      
      return new Response(JSON.stringify({
        prediction,
        success: true
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate music
    if (!prompt) {
      return new Response(JSON.stringify({
        error: 'Missing required field: prompt is required',
        success: false
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Generating AI music with prompt:', prompt, 'duration:', duration);

    const prediction = await replicate.predictions.create({
      version: "671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb",
      input: {
        prompt: prompt,
        model_version: "stereo-large",
        output_format: "mp3",
        normalization_strategy: "peak",
        duration: duration || 10
      }
    });

    console.log('Music generation started:', prediction.id);

    return new Response(JSON.stringify({
      prediction,
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
