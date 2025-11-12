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

For ZIP files:
- Output JSON with this structure: { "files": [{ "name": "filename.ext", "content": "file content here" }, ...] }
- Create multiple files as needed based on the user's request
- Use appropriate file names and extensions
- Keep individual file contents concise but complete

IMPORTANT: Output ONLY the file content (or JSON for ZIP), no explanations or markdown code blocks.`;

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
      
      case 'zip':
        mimeType = 'application/zip';
        fileName = 'generated-file.zip';
        // For ZIP files, we need to parse the AI's structured output
        fileContent = await generateZipFile(generatedContent);
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

// ZIP file generator using Deno's native APIs
async function generateZipFile(content: string): Promise<Uint8Array> {
  try {
    // Parse the AI's structured output to get file structure
    // Expected format: JSON with files array [{ name: "file.txt", content: "..." }]
    let filesData: Array<{ name: string; content: string }>;
    
    try {
      const parsed = JSON.parse(content);
      filesData = parsed.files || [{ name: 'readme.txt', content: parsed.content || content }];
    } catch {
      // If not JSON, create a single file
      filesData = [{ name: 'content.txt', content: content }];
    }

    // Create ZIP using simple ZIP format (no compression for simplicity and compatibility)
    const encoder = new TextEncoder();
    const files: Array<{ name: string; data: Uint8Array; offset: number }> = [];
    let currentOffset = 0;

    // Local file headers
    const localHeaders: Uint8Array[] = [];
    
    for (const file of filesData) {
      const fileData = encoder.encode(file.content);
      const fileName = encoder.encode(file.name);
      
      // Local file header
      const header = new Uint8Array(30 + fileName.length);
      const view = new DataView(header.buffer);
      
      // Local file header signature
      view.setUint32(0, 0x04034b50, true);
      // Version needed to extract
      view.setUint16(4, 10, true);
      // General purpose bit flag (no compression)
      view.setUint16(6, 0, true);
      // Compression method (0 = no compression)
      view.setUint16(8, 0, true);
      // Last mod time & date (set to zero for simplicity)
      view.setUint16(10, 0, true);
      view.setUint16(12, 0, true);
      // CRC-32 (simplified - using 0)
      view.setUint32(14, 0, true);
      // Compressed size
      view.setUint32(18, fileData.length, true);
      // Uncompressed size
      view.setUint32(22, fileData.length, true);
      // File name length
      view.setUint16(26, fileName.length, true);
      // Extra field length
      view.setUint16(28, 0, true);
      
      // Copy file name
      header.set(fileName, 30);
      
      localHeaders.push(header);
      files.push({ name: file.name, data: fileData, offset: currentOffset });
      currentOffset += header.length + fileData.length;
    }

    // Central directory
    const centralDir: Uint8Array[] = [];
    let centralDirSize = 0;
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileName = encoder.encode(file.name);
      
      const cdHeader = new Uint8Array(46 + fileName.length);
      const view = new DataView(cdHeader.buffer);
      
      // Central directory file header signature
      view.setUint32(0, 0x02014b50, true);
      // Version made by
      view.setUint16(4, 10, true);
      // Version needed to extract
      view.setUint16(6, 10, true);
      // General purpose bit flag
      view.setUint16(8, 0, true);
      // Compression method
      view.setUint16(10, 0, true);
      // Last mod time & date
      view.setUint16(12, 0, true);
      view.setUint16(14, 0, true);
      // CRC-32
      view.setUint32(16, 0, true);
      // Compressed size
      view.setUint32(20, file.data.length, true);
      // Uncompressed size
      view.setUint32(24, file.data.length, true);
      // File name length
      view.setUint16(28, fileName.length, true);
      // Extra field length
      view.setUint16(30, 0, true);
      // File comment length
      view.setUint16(32, 0, true);
      // Disk number start
      view.setUint16(34, 0, true);
      // Internal file attributes
      view.setUint16(36, 0, true);
      // External file attributes
      view.setUint32(38, 0, true);
      // Relative offset of local header
      view.setUint32(42, file.offset, true);
      
      // Copy file name
      cdHeader.set(fileName, 46);
      
      centralDir.push(cdHeader);
      centralDirSize += cdHeader.length;
    }

    // End of central directory record
    const eocd = new Uint8Array(22);
    const eocdView = new DataView(eocd.buffer);
    
    // End of central directory signature
    eocdView.setUint32(0, 0x06054b50, true);
    // Number of this disk
    eocdView.setUint16(4, 0, true);
    // Disk where central directory starts
    eocdView.setUint16(6, 0, true);
    // Number of central directory records on this disk
    eocdView.setUint16(8, files.length, true);
    // Total number of central directory records
    eocdView.setUint16(10, files.length, true);
    // Size of central directory
    eocdView.setUint32(12, centralDirSize, true);
    // Offset of start of central directory
    eocdView.setUint32(16, currentOffset, true);
    // ZIP file comment length
    eocdView.setUint16(20, 0, true);

    // Combine all parts
    const totalSize = currentOffset + centralDirSize + eocd.length;
    const zipData = new Uint8Array(totalSize);
    let offset = 0;
    
    // Write local file headers and data
    for (let i = 0; i < files.length; i++) {
      zipData.set(localHeaders[i], offset);
      offset += localHeaders[i].length;
      zipData.set(files[i].data, offset);
      offset += files[i].data.length;
    }
    
    // Write central directory
    for (const cd of centralDir) {
      zipData.set(cd, offset);
      offset += cd.length;
    }
    
    // Write end of central directory
    zipData.set(eocd, offset);
    
    return zipData;
  } catch (error) {
    console.error('ZIP generation error:', error);
    throw new Error('Failed to generate ZIP file');
  }
}

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
  const objectOffsets: number[] = [];
  
  // Catalog
  pdfObjects += `${objectNumber} 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  objectOffsets.push(pdfObjects.length);
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
  xref += `0 ${objectOffsets.length + 1}\n`;
  xref += '0000000000 65535 f \n';
  
  for (let i = 0; i < objectOffsets.length; i++) {
    const offset = objectOffsets[i].toString().padStart(10, '0');
    xref += `${offset} 00000 n \n`;
  }
  
  // Build trailer
  const xrefOffset = pdfObjects.length;
  const trailer = `trailer\n<< /Size ${objectOffsets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  
  const fullPDF = `%PDF-1.4\n${pdfObjects}${xref}${trailer}`;
  return new TextEncoder().encode(fullPDF);
}
