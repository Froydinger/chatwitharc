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
    const authHeader = req.headers.get('Authorization');
    
    console.log('Generating file:', { fileType, promptLength: prompt?.length });

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!lovableApiKey || !supabaseUrl || !supabaseKey) {
      throw new Error('Server configuration error - missing environment variables');
    }

    // Get user ID from auth token
    const authClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader! } }
    });
    
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      console.error('Authentication error:', authError);
      throw new Error('Unauthorized - user must be logged in');
    }

    console.log('Authenticated user:', user.id);

    // Use AI to generate the file content based on the prompt
    const systemPrompt = `You are a file content generator. Generate complete, properly formatted content for ${fileType} files.
    
For PDF content:
- Output clean, well-structured text that will be rendered in a PDF
- Use simple text formatting - no markdown, no special characters
- For blank spaces/lines for writing, use the word "________________" (exactly 16 underscores) as a placeholder for lines
- For section headings, use clear text followed by a blank line
- Ensure proper spacing between sections with blank lines
- Keep it simple and printer-friendly

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

    // Upload to Supabase Storage in user's folder
    const storageClient = createClient(supabaseUrl, supabaseKey);
    const timestamp = Date.now();
    const filePath = `${user.id}/generated-${timestamp}-${fileName}`;
    
    console.log('Uploading to generated-files bucket:', filePath);
    
    const { data: uploadData, error: uploadError } = await storageClient.storage
      .from('generated-files')
      .upload(filePath, fileContent, {
        contentType: mimeType,
        upsert: false
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw new Error(`Failed to upload file: ${uploadError.message}`);
    }

    // Get public URL
    const { data: { publicUrl } } = storageClient.storage
      .from('generated-files')
      .getPublicUrl(filePath);

    console.log('File generated and uploaded:', publicUrl);

    // Calculate file size
    const fileSize = fileContent.byteLength;

    // Store file metadata in database
    const { error: dbError } = await authClient
      .from('generated_files')
      .insert({
        user_id: user.id,
        file_name: fileName.replace(/\.[^/.]+$/, ''),
        file_url: publicUrl,
        file_type: fileType.toLowerCase(),
        file_size: fileSize,
        mime_type: mimeType,
        prompt: prompt
      });

    if (dbError) {
      console.error('Database insert error:', dbError);
      // Don't fail the request if metadata storage fails
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        fileUrl: publicUrl,
        fileName,
        mimeType,
        fileSize
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

// Improved PDF generator with proper text wrapping and formatting
async function generateSimplePDF(content: string): Promise<Uint8Array> {
  const pageWidth = 612; // 8.5 inches * 72 points/inch
  const pageHeight = 792; // 11 inches * 72 points/inch
  const margin = 72; // 1 inch margins for printability
  const lineHeight = 18; // Increased for better readability and writing space
  const maxWidth = pageWidth - (margin * 2);
  const charsPerLine = 70; // Slightly reduced for better margins
  
  // Split content into lines and wrap long lines
  const rawLines = content.split('\n');
  const wrappedLines: string[] = [];
  
  for (const line of rawLines) {
    // Convert underscore placeholders to actual underscores for blank lines
    if (line.includes('________________')) {
      wrappedLines.push(line.replace(/_{16,}/g, '________________________________________'));
      continue;
    }
    
    if (line.length <= charsPerLine) {
      wrappedLines.push(line);
    } else {
      // Wrap long lines
      const words = line.split(' ');
      let currentLine = '';
      
      for (const word of words) {
        if ((currentLine + ' ' + word).length <= charsPerLine) {
          currentLine += (currentLine ? ' ' : '') + word;
        } else {
          if (currentLine) wrappedLines.push(currentLine);
          currentLine = word;
        }
      }
      if (currentLine) wrappedLines.push(currentLine);
    }
  }
  
  // Calculate pages needed
  const linesPerPage = Math.floor((pageHeight - (margin * 2)) / lineHeight);
  const totalPages = Math.ceil(wrappedLines.length / linesPerPage);
  
  // Build PDF objects
  let pdfObjects = '';
  let objectNumber = 1;
  const objectOffsets: number[] = [0]; // First entry is always 0
  
  // Catalog
  let currentOffset = 0;
  pdfObjects += `${objectNumber} 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  objectOffsets.push(currentOffset + pdfObjects.length);
  objectNumber++;
  
  // Pages object
  const pageRefs = Array.from({length: totalPages}, (_, i) => `${3 + i} 0 R`).join(' ');
  pdfObjects += `${objectNumber} 0 obj\n<< /Type /Pages /Kids [${pageRefs}] /Count ${totalPages} >>\nendobj\n`;
  objectOffsets.push(currentOffset + pdfObjects.length);
  objectNumber++;
  
  // Font object
  const fontObjNum = objectNumber;
  pdfObjects += `${objectNumber} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`;
  objectOffsets.push(currentOffset + pdfObjects.length);
  objectNumber++;
  
  // Create page objects and content streams
  for (let pageNum = 0; pageNum < totalPages; pageNum++) {
    const startLine = pageNum * linesPerPage;
    const endLine = Math.min(startLine + linesPerPage, wrappedLines.length);
    const pageLines = wrappedLines.slice(startLine, endLine);
    
    // Build content stream
    let contentStream = 'BT\n';
    contentStream += '/F1 12 Tf\n'; // Slightly larger font
    contentStream += `${margin} ${pageHeight - margin - 20} Td\n`; // Start a bit lower
    contentStream += `${lineHeight} TL\n`; // Set leading (line height)
    
    for (const line of pageLines) {
      // Escape special characters and handle empty lines
      const escapedLine = line
        .replace(/\\/g, '\\\\')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)')
        .replace(/\r/g, '')
        .trim();
      
      // For empty lines, just move down
      if (escapedLine === '') {
        contentStream += 'T*\n';
      } else {
        contentStream += `(${escapedLine}) Tj T*\n`;
      }
    }
    contentStream += 'ET\n';
    
    const contentLength = contentStream.length;
    
    // Content stream object
    const contentObjNum = objectNumber;
    pdfObjects += `${objectNumber} 0 obj\n<< /Length ${contentLength} >>\nstream\n${contentStream}endstream\nendobj\n`;
    objectOffsets.push(currentOffset + pdfObjects.length);
    objectNumber++;
    
    // Page object
    pdfObjects += `${3 + pageNum} 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 ${fontObjNum} 0 R >> >> /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${contentObjNum} 0 R >>\nendobj\n`;
    objectOffsets.push(currentOffset + pdfObjects.length);
    objectNumber++;
  }
  
  // Build xref table
  let xref = 'xref\n';
  xref += `0 ${objectOffsets.length}\n`;
  xref += '0000000000 65535 f \n';
  
  for (let i = 1; i < objectOffsets.length; i++) {
    const offset = objectOffsets[i].toString().padStart(10, '0');
    xref += `${offset} 00000 n \n`;
  }
  
  // Build trailer
  const xrefOffset = pdfObjects.length;
  const trailer = `trailer\n<< /Size ${objectOffsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  
  const fullPDF = `%PDF-1.4\n${pdfObjects}${xref}${trailer}`;
  return new TextEncoder().encode(fullPDF);
}
