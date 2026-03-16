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
    const { fileType, content, prompt, model } = await req.json();
    const authHeader = req.headers.get('Authorization');

    // Input validation
    if (!fileType || typeof fileType !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'fileType is required and must be a string' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Validate fileType against allowlist (prevent arbitrary file types)
    const allowedFileTypes = ['pdf', 'txt', 'md', 'markdown', 'html', 'json', 'csv', 'zip', 'docx', 'doc', 'pptx'];
    if (!allowedFileTypes.includes(fileType.toLowerCase())) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Invalid file type. Allowed: ${allowedFileTypes.join(', ')}`
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Validate prompt
    if (!prompt || typeof prompt !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'prompt is required and must be a string' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Limit prompt length (prevent DoS)
    if (prompt.length > 10000) {
      return new Response(
        JSON.stringify({ success: false, error: 'Prompt too long (max 10000 characters)' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Validate content if provided
    if (content !== undefined && typeof content !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'content must be a string if provided' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

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
const systemPrompt = `You are a world-class document designer and content creator. Generate stunning, professionally formatted content for ${fileType} files. Your documents should look like they were designed by a professional — not just plain text dumps.

For PDF content:
- Create visually structured documents with clear hierarchy
- Use "═══════════════════════════════════" for major section dividers
- Use "───────────────────────────────────" for minor section dividers  
- Use "•" for bullet points, "  ◦" for sub-bullets
- Use UPPERCASE for main headings, Title Case for subheadings
- Add generous spacing between sections (2-3 blank lines between major sections)
- For writing lines, use "________________________________________"
- Structure content with clear visual rhythm: heading → description → details → spacing
- Think about information hierarchy and visual balance
- Make it printer-friendly and scannable

For DOCX/DOC content:
- Output structured JSON with this format: { "title": "Document Title", "sections": [{ "type": "heading"|"subheading"|"paragraph"|"bullets"|"numbered"|"divider"|"spacer", "content": "text" OR ["item1","item2"] }] }
- Create rich, well-organized documents with proper heading hierarchy
- Use a mix of headings, paragraphs, bullet lists, and numbered lists
- Write compelling, detailed content — not placeholder text
- Think like a professional writer: strong openings, clear structure, impactful conclusions

For PPTX content:
- Output structured JSON: { "title": "Presentation Title", "slides": [{ "title": "Slide Title", "subtitle": "optional subtitle", "type": "title"|"content"|"bullets"|"two-column"|"quote"|"section", "content": "text" OR ["bullet1","bullet2"], "notes": "speaker notes" }] }
- Create visually balanced slides — max 5-6 bullet points per slide
- Use the 10-20-30 rule: meaningful titles, concise points
- Include a title slide, agenda/overview, content slides, and a closing slide
- Write real, substantive content — not generic filler
- Add speaker notes for context

For HTML content:
- Generate a complete, beautiful standalone HTML page with embedded CSS
- Use modern CSS: flexbox/grid, gradients, shadows, nice typography
- Include a <style> block with professional styling
- Use Google Fonts or system font stacks
- Make it responsive and visually polished

For Markdown (MD):
- Use full markdown formatting: headers, bold, italic, tables, code blocks, blockquotes
- Structure with clear hierarchy and visual variety
- Add horizontal rules between major sections

For data files (JSON, CSV):
- Output properly formatted, realistic data structures
- Use meaningful, realistic sample data — not "test" or "example"

For ZIP files:
- Output JSON: { "files": [{ "name": "filename.ext", "content": "file content" }, ...] }
- Create a well-organized file structure with multiple files

CRITICAL: Output ONLY the raw file content (or JSON for DOCX/PPTX/ZIP). No explanations, no markdown code fences wrapping the output.`;

    // Use passed model for file generation (defaults to Gemini 3 Flash)
    const selectedModel = model || 'google/gemini-3-flash-preview';
    console.log('Using model for file generation:', selectedModel);

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: selectedModel,
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
      
      case 'docx':
      case 'doc':
        mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        fileName = 'generated-document.docx';
        fileContent = await generateDocx(generatedContent);
        break;
      
      case 'pptx':
        mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
        fileName = 'generated-presentation.pptx';
        fileContent = await generatePptx(generatedContent);
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

  } catch (error: unknown) {
    console.error('File generation error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: message 
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

// CRC-32 calculation for ZIP files
function calculateCRC32(data: Uint8Array): number {
  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[i] = c;
  }
  
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// DOS date/time encoding for ZIP files
function getDosDateTime(): { date: number; time: number } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = Math.floor(now.getSeconds() / 2);
  
  const date = ((year - 1980) << 9) | (month << 5) | day;
  const time = (hours << 11) | (minutes << 5) | seconds;
  
  return { date, time };
}

// ZIP file generator with proper CRC-32 checksums
async function generateZipFile(content: string): Promise<Uint8Array> {
  try {
    // Parse the AI's structured output to get file structure
    let filesData: Array<{ name: string; content: string }>;
    
    try {
      const parsed = JSON.parse(content);
      filesData = parsed.files || [{ name: 'readme.txt', content: parsed.content || content }];
    } catch {
      filesData = [{ name: 'content.txt', content: content }];
    }

    const encoder = new TextEncoder();
    const { date: dosDate, time: dosTime } = getDosDateTime();
    const files: Array<{ 
      name: string; 
      data: Uint8Array; 
      crc32: number;
      offset: number 
    }> = [];
    let currentOffset = 0;

    const localHeaders: Uint8Array[] = [];
    
    // Generate local file headers and calculate CRCs
    for (const file of filesData) {
      const fileData = encoder.encode(file.content);
      const fileName = encoder.encode(file.name);
      const crc32 = calculateCRC32(fileData);
      
      const header = new Uint8Array(30 + fileName.length);
      const view = new DataView(header.buffer);
      
      view.setUint32(0, 0x04034b50, true); // Local file header signature
      view.setUint16(4, 20, true); // Version needed (2.0)
      view.setUint16(6, 0, true); // General purpose bit flag
      view.setUint16(8, 0, true); // No compression
      view.setUint16(10, dosTime, true); // Last mod time
      view.setUint16(12, dosDate, true); // Last mod date
      view.setUint32(14, crc32, true); // CRC-32
      view.setUint32(18, fileData.length, true); // Compressed size
      view.setUint32(22, fileData.length, true); // Uncompressed size
      view.setUint16(26, fileName.length, true); // File name length
      view.setUint16(28, 0, true); // Extra field length
      
      header.set(fileName, 30);
      
      localHeaders.push(header);
      files.push({ 
        name: file.name, 
        data: fileData, 
        crc32,
        offset: currentOffset 
      });
      currentOffset += header.length + fileData.length;
    }

    // Generate central directory
    const centralDir: Uint8Array[] = [];
    let centralDirSize = 0;
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileName = encoder.encode(file.name);
      
      const cdHeader = new Uint8Array(46 + fileName.length);
      const view = new DataView(cdHeader.buffer);
      
      view.setUint32(0, 0x02014b50, true); // Central directory signature
      view.setUint16(4, 20, true); // Version made by
      view.setUint16(6, 20, true); // Version needed
      view.setUint16(8, 0, true); // General purpose bit flag
      view.setUint16(10, 0, true); // Compression method
      view.setUint16(12, dosTime, true); // Last mod time
      view.setUint16(14, dosDate, true); // Last mod date
      view.setUint32(16, file.crc32, true); // CRC-32
      view.setUint32(20, file.data.length, true); // Compressed size
      view.setUint32(24, file.data.length, true); // Uncompressed size
      view.setUint16(28, fileName.length, true); // File name length
      view.setUint16(30, 0, true); // Extra field length
      view.setUint16(32, 0, true); // File comment length
      view.setUint16(34, 0, true); // Disk number
      view.setUint16(36, 0, true); // Internal file attributes
      view.setUint32(38, 0x81A40000, true); // External file attributes (regular file)
      view.setUint32(42, file.offset, true); // Local header offset
      
      cdHeader.set(fileName, 46);
      
      centralDir.push(cdHeader);
      centralDirSize += cdHeader.length;
    }

    // End of central directory record
    const eocd = new Uint8Array(22);
    const eocdView = new DataView(eocd.buffer);
    
    eocdView.setUint32(0, 0x06054b50, true); // EOCD signature
    eocdView.setUint16(4, 0, true); // Disk number
    eocdView.setUint16(6, 0, true); // Central directory start disk
    eocdView.setUint16(8, files.length, true); // Entries on this disk
    eocdView.setUint16(10, files.length, true); // Total entries
    eocdView.setUint32(12, centralDirSize, true); // Central directory size
    eocdView.setUint32(16, currentOffset, true); // Central directory offset
    eocdView.setUint16(20, 0, true); // Comment length

    // Assemble the complete ZIP file
    const totalSize = currentOffset + centralDirSize + eocd.length;
    const zipData = new Uint8Array(totalSize);
    let offset = 0;
    
    for (let i = 0; i < files.length; i++) {
      zipData.set(localHeaders[i], offset);
      offset += localHeaders[i].length;
      zipData.set(files[i].data, offset);
      offset += files[i].data.length;
    }
    
    for (const cd of centralDir) {
      zipData.set(cd, offset);
      offset += cd.length;
    }
    
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
  
  // Two-pass PDF generation: first build all content, then calculate correct offsets
  const pdfHeader = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'; // Binary comment for PDF identification
  
  // Pre-calculate object numbers
  // Obj 1: Catalog, Obj 2: Pages, Obj 3: Font
  // Then for each page: content stream obj, page obj
  const fontObjNum = 3;
  const firstPageContentObj = 4;
  
  const pageObjectNumbers: number[] = [];
  for (let i = 0; i < totalPages; i++) {
    pageObjectNumbers.push(firstPageContentObj + (i * 2) + 1); // page obj follows content obj
  }
  
  // Build all objects in order, tracking offsets correctly
  const objects: string[] = [];
  
  // Obj 1: Catalog
  objects.push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
  
  // Obj 2: Pages
  const pageRefs = pageObjectNumbers.map(num => `${num} 0 R`).join(' ');
  objects.push(`2 0 obj\n<< /Type /Pages /Kids [${pageRefs}] /Count ${totalPages} >>\nendobj\n`);
  
  // Obj 3: Font
  objects.push(`${fontObjNum} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`);
  
  // Page content + page objects
  let objNum = firstPageContentObj;
  for (let pageNum = 0; pageNum < totalPages; pageNum++) {
    const startLine = pageNum * linesPerPage;
    const endLine = Math.min(startLine + linesPerPage, wrappedLines.length);
    const pageLines = wrappedLines.slice(startLine, endLine);
    
    let contentStream = 'BT\n';
    contentStream += '/F1 12 Tf\n';
    contentStream += `${margin} ${pageHeight - margin - 20} Td\n`;
    contentStream += `${lineHeight} TL\n`;
    
    for (const line of pageLines) {
      const escapedLine = line
        .replace(/\\/g, '\\\\')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)')
        .replace(/\r/g, '')
        .trim();
      
      if (escapedLine === '') {
        contentStream += 'T*\n';
      } else {
        contentStream += `(${escapedLine}) Tj T*\n`;
      }
    }
    contentStream += 'ET\n';
    
    const contentObjNum = objNum;
    objects.push(`${contentObjNum} 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}endstream\nendobj\n`);
    objNum++;
    
    const pageObjNum = objNum;
    objects.push(`${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 ${fontObjNum} 0 R >> >> /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${contentObjNum} 0 R >>\nendobj\n`);
    objNum++;
  }
  
  // Calculate correct byte offsets for each object
  const objectOffsets: number[] = [];
  let currentOffset = pdfHeader.length;
  const allObjectsStr = objects.map(obj => {
    objectOffsets.push(currentOffset);
    currentOffset += obj.length;
    return obj;
  }).join('');
  
  // Build xref table
  const totalObjects = objects.length;
  let xref = 'xref\n';
  xref += `0 ${totalObjects + 1}\n`;
  xref += '0000000000 65535 f \n';
  
  for (const offset of objectOffsets) {
    xref += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  }
  
  const xrefOffset = pdfHeader.length + allObjectsStr.length;
  const trailer = `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  const fullPDF = `${pdfHeader}${allObjectsStr}${xref}${trailer}`;
  return new TextEncoder().encode(fullPDF);
}

// Helper to build a ZIP from file entries (reused by DOCX/PPTX)
function buildZipFromEntries(entries: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const encoder = new TextEncoder();
  const { date: dosDate, time: dosTime } = getDosDateTime();
  const files: Array<{ name: string; data: Uint8Array; crc32: number; offset: number }> = [];
  let currentOffset = 0;
  const localHeaders: Uint8Array[] = [];

  for (const entry of entries) {
    const fileName = encoder.encode(entry.name);
    const crc32 = calculateCRC32(entry.data);

    const header = new Uint8Array(30 + fileName.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, dosTime, true);
    view.setUint16(12, dosDate, true);
    view.setUint32(14, crc32, true);
    view.setUint32(18, entry.data.length, true);
    view.setUint32(22, entry.data.length, true);
    view.setUint16(26, fileName.length, true);
    view.setUint16(28, 0, true);
    header.set(fileName, 30);

    localHeaders.push(header);
    files.push({ name: entry.name, data: entry.data, crc32, offset: currentOffset });
    currentOffset += header.length + entry.data.length;
  }

  const centralDir: Uint8Array[] = [];
  let centralDirSize = 0;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fileName = encoder.encode(file.name);
    const cdHeader = new Uint8Array(46 + fileName.length);
    const view = new DataView(cdHeader.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, dosTime, true);
    view.setUint16(14, dosDate, true);
    view.setUint32(16, file.crc32, true);
    view.setUint32(20, file.data.length, true);
    view.setUint32(24, file.data.length, true);
    view.setUint16(28, fileName.length, true);
    view.setUint16(30, 0, true);
    view.setUint16(32, 0, true);
    view.setUint16(34, 0, true);
    view.setUint16(36, 0, true);
    view.setUint32(38, 0, true);
    view.setUint32(42, file.offset, true);
    cdHeader.set(fileName, 46);
    centralDir.push(cdHeader);
    centralDirSize += cdHeader.length;
  }

  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(4, 0, true);
  eocdView.setUint16(6, 0, true);
  eocdView.setUint16(8, files.length, true);
  eocdView.setUint16(10, files.length, true);
  eocdView.setUint32(12, centralDirSize, true);
  eocdView.setUint32(16, currentOffset, true);
  eocdView.setUint16(20, 0, true);

  const totalSize = currentOffset + centralDirSize + eocd.length;
  const zipData = new Uint8Array(totalSize);
  let offset = 0;
  for (let i = 0; i < files.length; i++) {
    zipData.set(localHeaders[i], offset);
    offset += localHeaders[i].length;
    zipData.set(files[i].data, offset);
    offset += files[i].data.length;
  }
  for (const cd of centralDir) {
    zipData.set(cd, offset);
    offset += cd.length;
  }
  zipData.set(eocd, offset);
  return zipData;
}

// Escape XML special characters
function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// Generate DOCX (Office Open XML) file
async function generateDocx(content: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();

  // Parse structured JSON from AI, fallback to plain text
  let sections: Array<{ type: string; content: string | string[] }> = [];
  let docTitle = 'Document';
  try {
    const parsed = JSON.parse(content);
    docTitle = parsed.title || 'Document';
    sections = parsed.sections || [];
  } catch {
    // Plain text fallback — split into paragraphs
    sections = content.split('\n\n').filter(Boolean).map(p => ({ type: 'paragraph', content: p }));
  }

  // Build document.xml body
  let bodyXml = '';
  for (const section of sections) {
    switch (section.type) {
      case 'heading':
        bodyXml += `<w:p><w:pPr><w:pStyle w:val="Heading1"/><w:spacing w:after="200"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="36"/><w:color w:val="1F3864"/></w:rPr><w:t>${escapeXml(String(section.content))}</w:t></w:r></w:p>`;
        break;
      case 'subheading':
        bodyXml += `<w:p><w:pPr><w:pStyle w:val="Heading2"/><w:spacing w:after="120"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/><w:color w:val="2E75B6"/></w:rPr><w:t>${escapeXml(String(section.content))}</w:t></w:r></w:p>`;
        break;
      case 'bullets':
      case 'numbered': {
        const items = Array.isArray(section.content) ? section.content : [String(section.content)];
        items.forEach((item, idx) => {
          bodyXml += `<w:p><w:pPr><w:spacing w:after="60"/><w:ind w:left="720"/></w:pPr><w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>${section.type === 'numbered' ? `${idx + 1}. ` : '• '}${escapeXml(item)}</w:t></w:r></w:p>`;
        });
        break;
      }
      case 'divider':
        bodyXml += `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="CCCCCC"/></w:pBdr><w:spacing w:after="200"/></w:pPr></w:p>`;
        break;
      case 'spacer':
        bodyXml += `<w:p><w:pPr><w:spacing w:after="400"/></w:pPr></w:p>`;
        break;
      default: {
        // paragraph
        const lines = String(section.content).split('\n');
        for (const line of lines) {
          bodyXml += `<w:p><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:sz w:val="22"/><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/></w:rPr><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`;
        }
      }
    }
  }

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mo="http://schemas.microsoft.com/office/mac/office/2008/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:mv="urn:schemas-microsoft-com:mac:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" mc:Ignorable="w14 wp14">
<w:body>
<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>
${bodyXml}
</w:body>
</w:document>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const wordRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

  const entries = [
    { name: '[Content_Types].xml', data: encoder.encode(contentTypesXml) },
    { name: '_rels/.rels', data: encoder.encode(relsXml) },
    { name: 'word/_rels/document.xml.rels', data: encoder.encode(wordRelsXml) },
    { name: 'word/document.xml', data: encoder.encode(documentXml) },
  ];

  return buildZipFromEntries(entries);
}

// Generate PPTX (Office Open XML) file
async function generatePptx(content: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();

  let slides: Array<{ title: string; subtitle?: string; type?: string; content?: string | string[]; notes?: string }> = [];
  let presTitle = 'Presentation';
  try {
    const parsed = JSON.parse(content);
    presTitle = parsed.title || 'Presentation';
    slides = parsed.slides || [];
  } catch {
    slides = [{ title: presTitle, type: 'title', content: content.substring(0, 200) }];
  }

  if (slides.length === 0) {
    slides = [{ title: 'Slide 1', type: 'content', content: content }];
  }

  // Color palette for slides
  const accentColors = ['1F3864', '2E75B6', '4472C4', '5B9BD5'];

  const slideXmls: string[] = [];
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const isTitle = slide.type === 'title' || slide.type === 'section';
    const bgColor = isTitle ? accentColors[0] : 'FFFFFF';
    const titleColor = isTitle ? 'FFFFFF' : '1F3864';
    const bodyColor = isTitle ? 'BDD7EE' : '333333';

    let bodyXml = '';
    if (slide.type === 'bullets' && Array.isArray(slide.content)) {
      bodyXml = slide.content.map(item => 
        `<a:p><a:pPr marL="342900" indent="-342900"><a:buChar char="•"/></a:pPr><a:r><a:rPr lang="en-US" sz="2000" dirty="0"><a:solidFill><a:srgbClr val="${bodyColor}"/></a:solidFill><a:latin typeface="Calibri"/></a:rPr><a:t>${escapeXml(item)}</a:t></a:r></a:p>`
      ).join('');
    } else if (slide.type === 'quote') {
      bodyXml = `<a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="en-US" sz="2400" i="1" dirty="0"><a:solidFill><a:srgbClr val="${bodyColor}"/></a:solidFill><a:latin typeface="Georgia"/></a:rPr><a:t>"${escapeXml(String(slide.content || ''))}"</a:t></a:r></a:p>`;
    } else if (slide.content) {
      const text = Array.isArray(slide.content) ? slide.content.join('\n') : String(slide.content);
      bodyXml = text.split('\n').map(line =>
        `<a:p><a:r><a:rPr lang="en-US" sz="1800" dirty="0"><a:solidFill><a:srgbClr val="${bodyColor}"/></a:solidFill><a:latin typeface="Calibri"/></a:rPr><a:t>${escapeXml(line)}</a:t></a:r></a:p>`
      ).join('');
    }

    const subtitleXml = slide.subtitle ? `<a:p><a:r><a:rPr lang="en-US" sz="1600" dirty="0"><a:solidFill><a:srgbClr val="${bodyColor}"/></a:solidFill><a:latin typeface="Calibri"/></a:rPr><a:t>${escapeXml(slide.subtitle)}</a:t></a:r></a:p>` : '';

    const titleY = isTitle ? '2300000' : '365125';
    const titleH = isTitle ? '1800000' : '1000000';
    const bodyY = isTitle ? '4200000' : '1600200';
    const bodyH = isTitle ? '1500000' : '4525963';

    const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
<p:cSld>
<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${bgColor}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>
<p:spTree>
<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
<p:spPr><a:xfrm><a:off x="838200" y="${titleY}"/><a:ext cx="10515600" cy="${titleH}"/></a:xfrm></p:spPr>
<p:txBody><a:bodyPr anchor="b"/><a:lstStyle/>
<a:p><a:pPr algn="${isTitle ? 'ctr' : 'l'}"/><a:r><a:rPr lang="en-US" sz="${isTitle ? '4000' : '3200'}" b="1" dirty="0"><a:solidFill><a:srgbClr val="${titleColor}"/></a:solidFill><a:latin typeface="Calibri"/></a:rPr><a:t>${escapeXml(slide.title)}</a:t></a:r></a:p>
${subtitleXml}
</p:txBody></p:sp>
<p:sp><p:nvSpPr><p:cNvPr id="3" name="Content"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr>
<p:spPr><a:xfrm><a:off x="838200" y="${bodyY}"/><a:ext cx="10515600" cy="${bodyH}"/></a:xfrm></p:spPr>
<p:txBody><a:bodyPr/><a:lstStyle/>
${bodyXml || '<a:p><a:endParaRPr lang="en-US"/></a:p>'}
</p:txBody></p:sp>
</p:spTree>
</p:cSld>
</p:sld>`;
    slideXmls.push(slideXml);
  }

  // Build relationships
  const slideRels = slides.map((_, i) => 
    `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`
  ).join('');

  const presentationXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" saveSubsetFonts="1">
<p:sldMasterIdLst/>
<p:sldIdLst>
${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('')}
</p:sldIdLst>
<p:sldSz cx="12192000" cy="6858000" type="screen4x3"/>
<p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`;

  const contentTypesOverrides = slides.map((_, i) =>
    `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
  ).join('');

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
${contentTypesOverrides}
</Types>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`;

  const pptRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${slideRels}
</Relationships>`;

  const entries = [
    { name: '[Content_Types].xml', data: encoder.encode(contentTypesXml) },
    { name: '_rels/.rels', data: encoder.encode(relsXml) },
    { name: 'ppt/_rels/presentation.xml.rels', data: encoder.encode(pptRelsXml) },
    { name: 'ppt/presentation.xml', data: encoder.encode(presentationXml) },
    ...slideXmls.map((xml, i) => ({ name: `ppt/slides/slide${i + 1}.xml`, data: encoder.encode(xml) })),
  ];

  return buildZipFromEntries(entries);
}
