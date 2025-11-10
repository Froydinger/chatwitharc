import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { fileType, content, prompt } = await req.json();
    console.log('Generating file:', { fileType, promptLength: prompt?.length });

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      throw new Error('Lovable API key not configured');
    }

    // Use AI to generate the file content based on the prompt
    const systemPrompt = `You are a file content generator. Generate complete, properly formatted content for ${fileType} files.
    
For PDF content, output clean, well-structured text/markdown that would make a good PDF document.
For documents (DOCX, TXT, MD), output the complete document content.
For data files (JSON, CSV, XML), output properly formatted data structures.

IMPORTANT: Output ONLY the file content, no explanations or markdown code blocks.`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
      }),
    });

    if (!aiResponse.ok) {
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const generatedContent = aiData.choices[0]?.message?.content;

    if (!generatedContent) {
      throw new Error('No content generated');
    }

    // Convert content to appropriate format
    let fileContent: Uint8Array;
    let mimeType: string;
    let fileName: string;

    switch (fileType.toLowerCase()) {
      case 'pdf':
        // For PDF, we'll create a simple text-based PDF
        // In production, you'd use a proper PDF library
        mimeType = 'application/pdf';
        fileName = 'generated-document.pdf';
        fileContent = await generateSimplePDF(generatedContent);
        break;
      
      case 'txt':
        mimeType = 'text/plain';
        fileName = 'generated-document.txt';
        fileContent = new TextEncoder().encode(generatedContent);
        break;
      
      case 'md':
      case 'markdown':
        mimeType = 'text/markdown';
        fileName = 'generated-document.md';
        fileContent = new TextEncoder().encode(generatedContent);
        break;
      
      case 'html':
        mimeType = 'text/html';
        fileName = 'generated-document.html';
        fileContent = new TextEncoder().encode(generatedContent);
        break;
      
      case 'json':
        mimeType = 'application/json';
        fileName = 'generated-data.json';
        fileContent = new TextEncoder().encode(generatedContent);
        break;
      
      case 'csv':
        mimeType = 'text/csv';
        fileName = 'generated-data.csv';
        fileContent = new TextEncoder().encode(generatedContent);
        break;
      
      default:
        mimeType = 'application/octet-stream';
        fileName = `generated-file.${fileType}`;
        fileContent = new TextEncoder().encode(generatedContent);
    }

    // Upload to Supabase Storage
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const filePath = `generated-files/${crypto.randomUUID()}-${fileName}`;
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('media')
      .upload(filePath, fileContent, {
        contentType: mimeType,
        upsert: false
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw new Error(`Failed to upload file: ${uploadError.message}`);
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('media')
      .getPublicUrl(filePath);

    console.log('File generated and uploaded:', publicUrl);

    return new Response(
      JSON.stringify({ 
        success: true, 
        fileUrl: publicUrl,
        fileName,
        mimeType
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error) {
    console.error('File generation error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );
  }
});

// Simple PDF generator (basic text PDF)
async function generateSimplePDF(content: string): Promise<Uint8Array> {
  // This is a very basic PDF structure
  // For production, you'd want to use a proper PDF library like jsPDF
  const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Resources 4 0 R /MediaBox [0 0 612 792] /Contents 5 0 R >>
endobj
4 0 obj
<< /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >>
endobj
5 0 obj
<< /Length ${content.length + 100} >>
stream
BT
/F1 12 Tf
50 750 Td
(${content.replace(/\n/g, ') Tj T* (')}) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000214 00000 n 
0000000304 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
${400 + content.length}
%%EOF`;

  return new TextEncoder().encode(pdfContent);
}
