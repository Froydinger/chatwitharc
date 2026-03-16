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

  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!lovableApiKey) {
    return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY not configured' }), {
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
    const { messages, fileBase64, fileName, mimeType } = await req.json();

    if (!messages || !fileBase64) {
      return new Response(JSON.stringify({ error: 'messages and fileBase64 are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Analyzing document:', fileName, 'type:', mimeType);

    // Build multimodal content for Gemini
    const lastMessage = messages[messages.length - 1];
    const userPrompt = lastMessage?.content || `Analyze and summarize this document: ${fileName}`;

    // For Gemini, we send the file as inline_data in the content array
    // Gemini 3 Flash supports PDF, DOCX (as application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document)
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

    const selectedModel = 'google/gemini-3-flash-preview';
    console.log('Using model:', selectedModel);

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
            content: `You are ArcAI. The user has attached a document file. Analyze it thoroughly: summarize key points, extract important data, and answer any specific questions. Be detailed and helpful. Format your response with clear sections using markdown.`
          },
          ...messages.slice(0, -1),
          {
            role: 'user',
            content: contentArray
          }
        ]
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Payment required. Please add credits.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ error: `Document analysis failed: ${response.status}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || 'Sorry, I could not analyze the document.';
    
    console.log('Document analysis complete, response length:', content.length);

    return new Response(JSON.stringify({ content, success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error in analyze-document:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
