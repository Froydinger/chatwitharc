import { arcTextCompletion } from '../_shared/arcTextCompletion.ts';
import { authorizedArcModelRoute } from '../_shared/arcModelAccess.ts';
import { ArcModelAccessError } from '../_shared/arcModelRouting.ts';
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiApiKey) {
    return new Response(JSON.stringify({ error: 'OPENAI_API_KEY not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Verify authentication
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const token = authHeader.replace('Bearer ', '');
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const { messages, fileBase64, fileName, mimeType } = body;

    if (!messages || !fileBase64) {
      return new Response(JSON.stringify({ error: 'messages and fileBase64 are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Analyzing document:', fileName, 'type:', mimeType);

    // Build multimodal content for GPT 6 Luna and supported premium routes
    const lastMessage = messages[messages.length - 1];
    const userPrompt = lastMessage?.content || `Analyze and summarize this document: ${fileName}`;

    // Send natively supported files as data URLs in OpenAI-compatible content blocks.
    // For unsupported types, we extract text client-side and send as text
    
    const isNativelySupported = [
      'application/pdf',
      'text/plain',
      'text/markdown',
      'text/html',
      'text/csv',
      'application/json',
    ].includes(mimeType);

    let contentArray: any[];

    if (isNativelySupported) {
      // Send as inline file data for native multimodal support
      // Strip the data URI prefix if present
      const base64Data = fileBase64.includes(',') ? fileBase64.split(',')[1] : fileBase64;
      
      contentArray = [
        { type: 'text', text: userPrompt },
        { 
          type: 'image_url', 
          image_url: { 
            url: `data:${mimeType};base64,${base64Data}` 
          } 
        }
      ];
    } else {
      // For DOCX/PPTX/XLSX - the client extracts text and sends it
      // fileBase64 in this case is actually the extracted text content
      contentArray = [
        { 
          type: 'text', 
          text: `${userPrompt}\n\n--- DOCUMENT CONTENT (${fileName}) ---\n${fileBase64}` 
        }
      ];
    }

    const route = await authorizedArcModelRoute(supabase, user, body, 'analysis');
    const selectedModel = route.model;
    const selectedReasoningEffort = route.effort;
    console.log('Using model:', selectedModel);

    const completed = await arcTextCompletion({ db: supabase, user, request: body,
      requestId: typeof body.submissionId === 'string' ? body.submissionId : crypto.randomUUID(),
      source: 'document-analysis', route, apiKey: openaiApiKey, messages: [
        { role: 'system', content: 'You are ArcAI. The user has attached a document file. Analyze it thoroughly: summarize key points, extract important data, and answer any specific questions. Be detailed and helpful. Format your response with clear sections using markdown.' },
        ...messages.slice(0, -1), { role: 'user', content: contentArray },
      ], maxTokens: 16_384 });
    const data = completed.data;
    const content = data.choices?.[0]?.message?.content || 'Sorry, I could not analyze the document.';
    
    console.log('Document analysis complete, response length:', content.length);

    return new Response(JSON.stringify({ content, success: true, model_used: completed.route.model, reasoning_effort_used: completed.route.effort, model_switch_notice: completed.notice }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error in analyze-document:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: error instanceof ArcModelAccessError ? error.status : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
