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
    const { fileType, content, prompt, reasoningEffort } = await req.json();
    const selectedReasoningEffort = ['low', 'medium', 'high'].includes(reasoningEffort)
      ? reasoningEffort
      : 'medium';
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

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!openaiApiKey || !supabaseUrl || !supabaseKey) {
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
- The PDF renderer understands markdown, so use it: "#"/"##"/"###" headings,
  **bold**, *italic*, inline code, > blockquotes, fenced code blocks and | tables |.
  Markers are typeset, never printed literally.
- Use "-" or "•" for bullets and indent two spaces per sub-bullet level;
  "1." / "2." for numbered lists
- Use "═══════════════════════════════════" for major section dividers and
  "───────────────────────────────────" for minor ones — both are drawn as
  real horizontal rules
- UPPERCASE lines are also treated as headings, so keep them short
- Add generous spacing between sections (2-3 blank lines between major sections)
- For fill-in-the-blank writing lines, use "________________________________________"
- Accented and Latin-1 text (café, €, £, —) renders correctly; avoid emoji,
  which are dropped
- Structure content with clear visual rhythm: heading → description → details → spacing
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

    // Luna is the only enabled text/reasoning model for now.
    const selectedModel = 'gpt-5.6-luna';
    console.log('Using model for file generation:', selectedModel);

    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: selectedModel,
        reasoning_effort: selectedReasoningEffort,
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

// ---------------------------------------------------------------------------
// PDF generation
//
// Writes a real PDF byte stream (no external deps, edge-function friendly).
// Three things matter here and are easy to get wrong:
//   1. Offsets in the xref table are BYTE offsets. Everything is assembled as
//      Uint8Array chunks so a multi-byte char can never desync the table.
//   2. Text is encoded as WinAnsi (the encoding declared on the fonts), so
//      accented Latin text ("café", "résumé", "£", "€") renders as written
//      instead of being replaced with "?".
//   3. The model is asked for visually structured output, so markdown and
//      box-drawing dividers are rendered as formatting (bold headings, real
//      bullets, drawn rules) rather than printed as literal characters.
// ---------------------------------------------------------------------------

type PdfStyle = 'regular' | 'bold' | 'italic' | 'bolditalic' | 'mono' | 'monobold';

interface PdfRun {
  text: string;
  style: PdfStyle;
}

// Font resource names, in the order the font objects are written.
const PDF_FONT_NAMES: Record<PdfStyle, string> = {
  regular: 'F1',
  bold: 'F2',
  italic: 'F3',
  bolditalic: 'F4',
  mono: 'F5',
  monobold: 'F6',
};

const PDF_BASE_FONTS: Array<[string, string]> = [
  ['F1', 'Helvetica'],
  ['F2', 'Helvetica-Bold'],
  ['F3', 'Helvetica-Oblique'],
  ['F4', 'Helvetica-BoldOblique'],
  ['F5', 'Courier'],
  ['F6', 'Courier-Bold'],
];

// --- WinAnsi encoding ------------------------------------------------------

// Characters that live in the 0x80-0x9F range of WinAnsiEncoding.
const WINANSI_HIGH: Record<string, number> = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84,
  '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88,
  '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c,
  'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93,
  '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97,
  '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b,
  'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
};

// Characters WinAnsi has no glyph for, but that carry meaning worth keeping.
const PDF_TRANSLITERATE: Record<string, string> = {
  '→': '->', '➔': '->', '⇒': '=>', '←': '<-', '⇐': '<=',
  '↔': '<->', '≤': '<=', '≥': '>=', '≠': '!=', '×': 'x',
  '−': '-', '⁄': '/', '‧': '•', '◦': 'o', '‣': '•',
  '⁃': '-', '▪': '•', '▫': 'o', '●': '•', '○': 'o',
  '✓': '[x]', '✔': '[x]', '☐': '[ ]', '☑': '[x]', '☒': '[x]',
  '\u2717': '[ ]', '\u2718': '[ ]', '\u2605': '*', '\u2606': '*',
  // Exotic spaces (thin, narrow-nbsp, figure, em/en quad...) -> plain space
  '\u2000': ' ', '\u2001': ' ', '\u2002': ' ', '\u2003': ' ', '\u2004': ' ',
  '\u2005': ' ', '\u2006': ' ', '\u2007': ' ', '\u2008': ' ', '\u2009': ' ',
  '\u200a': ' ', '\u202f': ' ', '\u205f': ' ', '\u3000': ' ',
};

// Dropped outright: zero-width joiners, variation selectors, emoji modifiers.
function isDroppedChar(code: number): boolean {
  return (
    (code >= 0x200b && code <= 0x200d) || // zero-width space/non-joiner/joiner
    code === 0xfeff ||                    // BOM
    (code >= 0xfe00 && code <= 0xfe0f) || // variation selectors
    (code >= 0x1f3fb && code <= 0x1f3ff)  // emoji skin-tone modifiers
  );
}

function encodeWinAnsi(text: string): number[] {
  const out: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0)!;

    if (code >= 0x20 && code <= 0x7e) { out.push(code); continue; }
    if (code === 0x09) { out.push(0x20); continue; }

    const high = WINANSI_HIGH[char];
    if (high !== undefined) { out.push(high); continue; }

    // A0-FF map one-to-one onto Latin-1 in WinAnsi (except the unused A0/AD).
    if (code >= 0xa1 && code <= 0xff) { out.push(code); continue; }

    const replacement = PDF_TRANSLITERATE[char];
    if (replacement !== undefined) { out.push(...encodeWinAnsi(replacement)); continue; }

    if (isDroppedChar(code)) continue;

    // Last resort: strip diacritics and keep the base letters if that lands
    // in ASCII (handles ā, ș, ł-adjacent forms and similar).
    const stripped = char.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (stripped !== char && /^[\x20-\x7e]+$/.test(stripped)) {
      out.push(...encodeWinAnsi(stripped));
    }
    // Anything else (emoji, CJK) is dropped rather than turned into "?" —
    // printing filler characters the user never wrote is worse than omitting.
  }
  return out;
}

// --- Glyph widths (AFM units / 1000) --------------------------------------

const HELVETICA_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

const HELVETICA_BOLD_WIDTHS = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

// Widths for the WinAnsi 0x80-0x9F block, keyed by byte.
const HIGH_WIDTHS: Record<number, [number, number]> = {
  0x80: [556, 556], 0x82: [222, 278], 0x83: [556, 556], 0x84: [333, 500],
  0x85: [1000, 1000], 0x86: [556, 556], 0x87: [556, 556], 0x88: [333, 333],
  0x89: [1000, 1000], 0x8a: [667, 667], 0x8b: [333, 333], 0x8c: [1000, 1000],
  0x8e: [611, 611], 0x91: [222, 278], 0x92: [222, 278], 0x93: [333, 500],
  0x94: [333, 500], 0x95: [350, 350], 0x96: [556, 556], 0x97: [1000, 1000],
  0x98: [333, 333], 0x99: [1000, 1000], 0x9a: [500, 556], 0x9b: [333, 333],
  0x9c: [944, 944], 0x9e: [500, 500], 0x9f: [667, 667],
};

// Accented byte -> the ASCII letter whose advance width it shares.
function latin1WidthProxy(byte: number): number {
  if (byte >= 0xc0 && byte <= 0xc6) return 0x41; // A
  if (byte === 0xc7) return 0x43;                // C
  if (byte >= 0xc8 && byte <= 0xcb) return 0x45; // E
  if (byte >= 0xcc && byte <= 0xcf) return 0x49; // I
  if (byte === 0xd0) return 0x44;                // D
  if (byte === 0xd1) return 0x4e;                // N
  if ((byte >= 0xd2 && byte <= 0xd6) || byte === 0xd8) return 0x4f; // O
  if (byte >= 0xd9 && byte <= 0xdc) return 0x55; // U
  if (byte === 0xdd || byte === 0x9f) return 0x59; // Y
  if (byte === 0xde) return 0x50;                // P
  if (byte === 0xdf) return 0x62;                // sharp s ~ b
  if (byte >= 0xe0 && byte <= 0xe6) return 0x61; // a
  if (byte === 0xe7) return 0x63;                // c
  if (byte >= 0xe8 && byte <= 0xeb) return 0x65; // e
  if (byte >= 0xec && byte <= 0xef) return 0x69; // i
  if (byte === 0xf1) return 0x6e;                // n
  if ((byte >= 0xf2 && byte <= 0xf6) || byte === 0xf8 || byte === 0xf0) return 0x6f; // o
  if (byte >= 0xf9 && byte <= 0xfc) return 0x75; // u
  if (byte === 0xfd || byte === 0xff) return 0x79; // y
  if (byte === 0xfe) return 0x70;                // p
  return 0x6f; // sensible default for the remaining symbols
}

function glyphWidth(byte: number, style: PdfStyle): number {
  if (style === 'mono' || style === 'monobold') return 600; // Courier is monospaced

  const boldish = style === 'bold' || style === 'bolditalic';
  const table = boldish ? HELVETICA_BOLD_WIDTHS : HELVETICA_WIDTHS;

  if (byte >= 0x20 && byte <= 0x7e) return table[byte - 0x20];

  const high = HIGH_WIDTHS[byte];
  if (high) return boldish ? high[1] : high[0];

  if (byte === 0xa0) return table[0];
  if (byte === 0xad) return boldish ? 333 : 333;
  if (byte >= 0xa1 && byte <= 0xbf) return boldish ? 556 : 556;
  if (byte >= 0xc0) return table[latin1WidthProxy(byte) - 0x20];

  return table[0];
}

function measureBytes(bytes: number[], style: PdfStyle, fontSize: number): number {
  let total = 0;
  for (const byte of bytes) total += glyphWidth(byte, style);
  return (total * fontSize) / 1000;
}

// --- Inline markdown -------------------------------------------------------

function withStyle(base: PdfStyle, add: 'bold' | 'italic' | 'mono'): PdfStyle {
  if (add === 'mono') return base === 'bold' || base === 'bolditalic' ? 'monobold' : 'mono';
  if (base === 'mono' || base === 'monobold') return add === 'bold' ? 'monobold' : base;
  const bold = add === 'bold' || base === 'bold' || base === 'bolditalic';
  const italic = add === 'italic' || base === 'italic' || base === 'bolditalic';
  if (bold && italic) return 'bolditalic';
  if (bold) return 'bold';
  if (italic) return 'italic';
  return 'regular';
}

/**
 * Turns inline markdown into styled runs. Markers are consumed, not printed —
 * literal "**" leaking into a finished document is the whole complaint here.
 */
function parseInline(text: string, base: PdfStyle = 'regular'): PdfRun[] {
  // Links and images become "label (url)" / "label" before styling.
  const source = text
    .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, label) => label || 'image')
    .replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, label, url) =>
      label.trim().toLowerCase() === String(url).trim().toLowerCase() ? label : `${label} (${url})`)
    .replace(/~~([^~]+)~~/g, '$1');

  const runs: PdfRun[] = [];
  let buffer = '';
  let index = 0;

  const flush = (style: PdfStyle) => {
    if (buffer) runs.push({ text: buffer, style });
    buffer = '';
  };

  while (index < source.length) {
    const rest = source.slice(index);

    const code = /^`+([^`]+)`+/.exec(rest);
    if (code) {
      flush(base);
      runs.push({ text: code[1], style: withStyle(base, 'mono') });
      index += code[0].length;
      continue;
    }

    // The (?!\1) guards keep runs of underscores ("Name: ________") intact —
    // they are writing lines in the generated forms, not emphasis markers.
    const strongEm = /^(\*\*\*|___)(?!\1[\s\S]*?)(?=\S)([\s\S]*?\S)\1/.exec(rest);
    if (strongEm) {
      flush(base);
      runs.push(...parseInline(strongEm[2], withStyle(withStyle(base, 'bold'), 'italic')));
      index += strongEm[0].length;
      continue;
    }

    const strong = /^(\*\*|__)(?!_|\*)(?=\S)([\s\S]*?\S)\1/.exec(rest);
    if (strong) {
      flush(base);
      runs.push(...parseInline(strong[2], withStyle(base, 'bold')));
      index += strong[0].length;
      continue;
    }

    // Single-marker emphasis: require a non-space neighbour so that
    // "2 * 3" and snake_case_words are left alone.
    const em = /^([*_])(?!\1)(?=\S)([^*_\n]*?\S)\1/.exec(rest);
    if (em && !(em[1] === '_' && /\w$/.test(source.slice(0, index)))) {
      flush(base);
      runs.push(...parseInline(em[2], withStyle(base, 'italic')));
      index += em[0].length;
      continue;
    }

    if (rest.startsWith('\\') && rest.length > 1) {
      buffer += rest[1];
      index += 2;
      continue;
    }

    buffer += source[index];
    index += 1;
  }

  flush(base);
  return runs.filter(run => run.text.length > 0);
}

// --- Block model -----------------------------------------------------------

interface PdfBlock {
  kind: 'text' | 'rule' | 'space';
  runs?: PdfRun[];
  fontSize?: number;
  lineGap?: number;
  indent?: number;      // left indent, points
  hangIndent?: number;  // extra indent for wrapped continuation lines
  marker?: PdfRun[];    // bullet / number drawn at `indent`
  spaceBefore?: number;
  spaceAfter?: number;
  ruleWeight?: number;  // rule blocks
  keepWithNext?: boolean;
  preserve?: boolean;   // no wrapping-driven whitespace collapse (code)
  height?: number;      // space blocks
}

const RULE_LINE = /^[═─━┄┅┈┉╌╍―—–−▬⸺⸻=~*#\-·•_\s]{3,}$/;

function isRuleLine(trimmed: string): boolean {
  if (trimmed.length < 3) return false;
  // All-underscore lines are fill-in-the-blank writing lines, not dividers.
  if (/^_+$/.test(trimmed)) return false;
  if (!RULE_LINE.test(trimmed)) return false;
  // Require a single repeated character so "- item" style content is safe.
  const chars = new Set(trimmed.replace(/\s/g, '').split(''));
  return chars.size === 1;
}

function ruleWeightFor(trimmed: string): number {
  const char = trimmed.trim()[0];
  return '═━▬='.includes(char) ? 1.4 : 0.6;
}

const HEADING_SIZES = [19, 15.5, 13.5, 12.5, 12, 12];

/**
 * Counts characters the WinAnsi base-14 fonts cannot represent at all.
 * Scripts like CJK, Arabic or Devanagari would need an embedded font, which an
 * edge function has no way to ship — so the document says so instead of coming
 * out mysteriously blank.
 */
function countUnrenderable(text: string): { dropped: number; total: number } {
  let dropped = 0;
  let total = 0;
  for (const char of text) {
    if (/\s/.test(char)) continue;
    total++;
    if (encodeWinAnsi(char).length === 0) dropped++;
  }
  return { dropped, total };
}

/** Splits the model's text into laid-out blocks (headings, lists, rules...). */
function parseBlocks(content: string, bodySize: number): PdfBlock[] {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const blocks: PdfBlock[] = [];
  let inCodeFence = false;
  let pendingBlank = 0;

  const pushSpace = (height: number) => {
    if (height > 0) blocks.push({ kind: 'space', height });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    const fence = /^\s*(```|~~~)/.exec(line);
    if (fence) {
      inCodeFence = !inCodeFence;
      pendingBlank = 0;
      pushSpace(bodySize * 0.4);
      continue;
    }

    if (inCodeFence) {
      pendingBlank = 0;
      blocks.push({
        kind: 'text',
        runs: [{ text: line.replace(/\t/g, '    ') || ' ', style: 'mono' }],
        fontSize: bodySize - 2,
        indent: 12,
        preserve: true,
      });
      continue;
    }

    if (!trimmed) {
      pendingBlank++;
      continue;
    }

    if (pendingBlank > 0 && blocks.length > 0) {
      // Collapse runs of blank lines; the model is told to use 2-3 of them.
      pushSpace(Math.min(pendingBlank, 3) * bodySize * 0.55);
    }
    pendingBlank = 0;

    if (isRuleLine(trimmed)) {
      blocks.push({
        kind: 'rule',
        ruleWeight: ruleWeightFor(trimmed),
        spaceBefore: bodySize * 0.5,
        spaceAfter: bodySize * 0.5,
      });
      continue;
    }

    // Markdown table: gather the contiguous block and lay it out as a grid.
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const rows: string[][] = [];
      let separatorAt = -1;
      let j = i;
      while (j < lines.length && /^\s*\|.*\|\s*$/.test(lines[j])) {
        const cells = lines[j].trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
        if (cells.every(c => /^:?-{2,}:?$/.test(c))) separatorAt = rows.length;
        else rows.push(cells);
        j++;
      }
      if (rows.length > 0) {
        blocks.push(...layoutTable(rows, separatorAt, bodySize));
        i = j - 1;
        continue;
      }
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      const level = heading[1].length;
      const size = HEADING_SIZES[level - 1];
      blocks.push({
        kind: 'text',
        runs: parseInline(heading[2].replace(/\s+#+\s*$/, ''), 'bold'),
        fontSize: size,
        spaceBefore: level <= 2 ? size * 0.6 : size * 0.45,
        spaceAfter: size * 0.3,
        keepWithNext: true,
      });
      continue;
    }

    // The model is instructed to use UPPERCASE for main headings.
    const isShoutHeading =
      trimmed === trimmed.toUpperCase() &&
      /[A-Z]/.test(trimmed) &&
      trimmed.length <= 60 &&
      trimmed.length > 2 &&
      !/[.!?,;]$/.test(trimmed) &&
      !/^[-*+•]/.test(trimmed);
    if (isShoutHeading) {
      blocks.push({
        kind: 'text',
        runs: parseInline(trimmed, 'bold'),
        fontSize: 13.5,
        spaceBefore: 9,
        spaceAfter: 4,
        keepWithNext: true,
      });
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(trimmed);
    if (quote) {
      blocks.push({
        kind: 'text',
        runs: parseInline(quote[1], 'italic'),
        fontSize: bodySize,
        indent: 22,
        spaceBefore: 2,
        spaceAfter: 2,
      });
      continue;
    }

    const bullet = /^(\s*)([-*+•◦‣▪]|\d{1,3}[.)])\s+(.*)$/.exec(line);
    if (bullet) {
      const depth = Math.min(Math.floor(bullet[1].replace(/\t/g, '  ').length / 2), 4);
      const ordered = /\d/.test(bullet[2]);
      const markerText = ordered ? bullet[2] : depth % 2 === 0 ? '•' : '-';
      const indent = 10 + depth * 16;
      const markerWidth = ordered ? 20 : 12;
      blocks.push({
        kind: 'text',
        runs: parseInline(bullet[3], 'regular'),
        marker: [{ text: markerText, style: 'regular' }],
        fontSize: bodySize,
        indent: indent + markerWidth,
        hangIndent: -markerWidth,
        spaceBefore: 1,
        spaceAfter: 1,
      });
      continue;
    }

    blocks.push({
      kind: 'text',
      runs: parseInline(trimmed, 'regular'),
      fontSize: bodySize,
      spaceBefore: 1,
      spaceAfter: 1,
    });
  }

  return blocks;
}

/** Renders a markdown table as padded monospace rows with a header rule. */
function layoutTable(rows: string[][], separatorAt: number, bodySize: number): PdfBlock[] {
  const columns = Math.max(...rows.map(r => r.length));
  const widths: number[] = [];
  for (let c = 0; c < columns; c++) {
    widths[c] = Math.max(3, ...rows.map(r => (r[c] ?? '').length));
  }

  const blocks: PdfBlock[] = [{ kind: 'space', height: bodySize * 0.4 }];
  rows.forEach((row, index) => {
    const isHeader = separatorAt === 1 && index === 0;
    const text = row
      .map((cell, c) => (cell ?? '').padEnd(widths[c], ' '))
      .join('  |  ');
    blocks.push({
      kind: 'text',
      runs: [{ text, style: isHeader ? 'monobold' : 'mono' }],
      fontSize: bodySize - 2.5,
      indent: 8,
      preserve: true,
      keepWithNext: isHeader,
    });
    if (isHeader) {
      blocks.push({ kind: 'rule', ruleWeight: 0.6, spaceBefore: 2, spaceAfter: 3 });
    }
  });
  blocks.push({ kind: 'space', height: bodySize * 0.4 });
  return blocks;
}

// --- Line breaking ---------------------------------------------------------

interface PdfPiece {
  bytes: number[];
  style: PdfStyle;
}

interface PdfLine {
  pieces: PdfPiece[];
  x: number;
  fontSize: number;
  marker?: PdfPiece;
  markerX?: number;
}

function wrapRuns(
  runs: PdfRun[],
  fontSize: number,
  startX: number,
  contWidth: number,
  firstWidth: number,
  preserve: boolean,
): PdfPiece[][] {
  if (preserve) {
    return [runs.map(run => ({ bytes: encodeWinAnsi(run.text), style: run.style }))];
  }

  interface Token { bytes: number[]; style: PdfStyle; space: boolean; width: number }
  const tokens: Token[] = [];
  for (const run of runs) {
    for (const part of run.text.split(/(\s+)/)) {
      if (!part) continue;
      const space = /^\s+$/.test(part);
      const bytes = encodeWinAnsi(space ? ' ' : part);
      if (bytes.length === 0) continue;
      tokens.push({ bytes, style: run.style, space, width: measureBytes(bytes, run.style, fontSize) });
    }
  }

  const lines: PdfPiece[][] = [];
  let current: Token[] = [];
  let used = 0;
  let available = firstWidth;

  const commit = () => {
    while (current.length && current[current.length - 1].space) current.pop();
    const pieces: PdfPiece[] = [];
    for (const token of current) {
      const last = pieces[pieces.length - 1];
      if (last && last.style === token.style) last.bytes.push(...token.bytes);
      else pieces.push({ bytes: [...token.bytes], style: token.style });
    }
    lines.push(pieces);
    current = [];
    used = 0;
    available = contWidth;
  };

  for (const token of tokens) {
    if (token.space && current.length === 0) continue;

    if (used + token.width > available && current.length > 0) {
      commit();
      if (token.space) continue;
    }

    // A single token wider than the column (a long URL, say) is split by glyph.
    if (token.width > available && !token.space) {
      let chunk: number[] = [];
      let chunkWidth = 0;
      for (const byte of token.bytes) {
        const width = (glyphWidth(byte, token.style) * fontSize) / 1000;
        if (chunkWidth + width > available && chunk.length > 0) {
          current.push({ bytes: chunk, style: token.style, space: false, width: chunkWidth });
          commit();
          chunk = [];
          chunkWidth = 0;
        }
        chunk.push(byte);
        chunkWidth += width;
      }
      if (chunk.length) {
        current.push({ bytes: chunk, style: token.style, space: false, width: chunkWidth });
        used += chunkWidth;
      }
      continue;
    }

    current.push(token);
    used += token.width;
  }

  if (current.length) commit();
  if (lines.length === 0) lines.push([]);
  return lines;
}

// --- Byte assembly ---------------------------------------------------------

class ByteBuffer {
  private chunks: Uint8Array[] = [];
  length = 0;

  ascii(text: string): void {
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
    this.raw(bytes);
  }

  raw(bytes: Uint8Array): void {
    this.chunks.push(bytes);
    this.length += bytes.length;
  }

  toUint8Array(): Uint8Array {
    const out = new Uint8Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }
}

/** Escapes a WinAnsi byte string for a PDF literal string. */
function pdfStringBytes(bytes: number[]): Uint8Array {
  const out: number[] = [];
  for (const byte of bytes) {
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) out.push(0x5c);
    out.push(byte);
  }
  return new Uint8Array(out);
}

interface PageOp {
  kind: 'text' | 'rule';
  line?: PdfLine;
  y: number;
  weight?: number;
}

async function generateSimplePDF(content: string): Promise<Uint8Array> {
  const pageWidth = 612;   // 8.5in * 72
  const pageHeight = 792;  // 11in * 72
  const margin = 64;
  const bodySize = 11;
  const bodyLeading = 15.5;
  const footerSize = 8.5;
  const contentWidth = pageWidth - margin * 2;
  const topY = pageHeight - margin;
  const bottomY = margin + 24; // leaves room for the page footer

  const text = String(content ?? '').trim();
  const blocks = parseBlocks(text, bodySize);

  // A document made mostly of glyphs the base-14 fonts lack would render blank.
  // Say so rather than handing the user an empty page.
  const { dropped, total } = countUnrenderable(text);
  if (dropped > 0 && (total === 0 || dropped / total >= 0.15)) {
    blocks.push({ kind: 'space', height: bodySize });
    blocks.push({ kind: 'rule', ruleWeight: 0.6, spaceBefore: 4, spaceAfter: 6 });
    blocks.push({
      kind: 'text',
      runs: [{
        text: 'Note: this document contains characters (such as non-Latin scripts or ' +
              'emoji) that cannot be embedded in a PDF here. They were omitted — the ' +
              'TXT, Markdown or DOCX export keeps them intact.',
        style: 'italic',
      }],
      fontSize: bodySize - 1.5,
      spaceBefore: 2,
    });
  }

  // --- Pass 1: lay blocks out into pages -----------------------------------
  const pages: PageOp[][] = [];
  let currentPage: PageOp[] = [];
  let cursorY = topY;

  const newPage = () => {
    pages.push(currentPage);
    currentPage = [];
    cursorY = topY;
  };

  const remaining = () => cursorY - bottomY;

  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];

    if (block.kind === 'space') {
      if (currentPage.length > 0) cursorY -= block.height ?? 0;
      continue;
    }

    if (block.kind === 'rule') {
      const needed = (block.spaceBefore ?? 0) + 4 + (block.spaceAfter ?? 0);
      if (needed > remaining()) newPage();
      cursorY -= block.spaceBefore ?? 0;
      currentPage.push({ kind: 'rule', y: cursorY, weight: block.ruleWeight ?? 0.6 });
      cursorY -= (block.spaceAfter ?? 0) + 2;
      continue;
    }

    const fontSize = block.fontSize ?? bodySize;
    const leading = fontSize <= bodySize ? bodyLeading : fontSize * 1.32;
    const indent = block.indent ?? 0;
    const hang = block.hangIndent ?? 0;
    const firstX = margin + indent + hang;
    const contX = margin + indent;
    const wrapped = wrapRuns(
      block.runs ?? [],
      fontSize,
      contX,
      contentWidth - indent,
      contentWidth - indent - hang,
      block.preserve === true,
    );

    const blockHeight = (block.spaceBefore ?? 0) + wrapped.length * leading;
    // Keep a heading (or table header) attached to what follows it.
    const keepExtra = block.keepWithNext ? leading * 1.5 : 0;
    if (blockHeight + keepExtra > remaining() && currentPage.length > 0) newPage();

    cursorY -= block.spaceBefore ?? 0;

    wrapped.forEach((pieces, lineIndex) => {
      if (leading > remaining() && currentPage.length > 0) newPage();
      cursorY -= leading;
      const line: PdfLine = {
        pieces,
        x: lineIndex === 0 ? firstX : contX,
        fontSize,
      };
      if (lineIndex === 0 && block.marker) {
        line.marker = { bytes: encodeWinAnsi(block.marker[0].text), style: block.marker[0].style };
        line.markerX = margin + indent + hang;
        line.x = margin + indent;
      }
      currentPage.push({ kind: 'text', line, y: cursorY });
    });

    cursorY -= block.spaceAfter ?? 0;
  }

  pages.push(currentPage);
  const renderedPages = pages.filter((ops, index) => ops.length > 0 || index === 0);
  const totalPages = Math.max(renderedPages.length, 1);

  // --- Pass 2: content streams --------------------------------------------
  const streams: Uint8Array[] = renderedPages.map((ops, pageIndex) => {
    const stream = new ByteBuffer();

    for (const op of ops) {
      if (op.kind === 'rule') {
        const weight = op.weight ?? 0.6;
        const gray = weight >= 1 ? '0.25' : '0.6';
        stream.ascii(
          `q ${weight} w ${gray} G ${margin} ${op.y.toFixed(2)} m ` +
          `${pageWidth - margin} ${op.y.toFixed(2)} l S Q\n`,
        );
        continue;
      }

      const line = op.line!;
      if (line.marker && line.marker.bytes.length > 0) {
        stream.ascii(`BT /${PDF_FONT_NAMES[line.marker.style]} ${line.fontSize} Tf `);
        stream.ascii(`1 0 0 1 ${(line.markerX ?? margin).toFixed(2)} ${op.y.toFixed(2)} Tm (`);
        stream.raw(pdfStringBytes(line.marker.bytes));
        stream.ascii(') Tj ET\n');
      }

      if (line.pieces.length === 0) continue;

      stream.ascii(`BT 1 0 0 1 ${line.x.toFixed(2)} ${op.y.toFixed(2)} Tm\n`);
      for (const piece of line.pieces) {
        if (piece.bytes.length === 0) continue;
        stream.ascii(`/${PDF_FONT_NAMES[piece.style]} ${line.fontSize} Tf (`);
        stream.raw(pdfStringBytes(piece.bytes));
        stream.ascii(') Tj\n');
      }
      stream.ascii('ET\n');
    }

    // Page footer.
    if (totalPages > 1) {
      const label = encodeWinAnsi(`Page ${pageIndex + 1} of ${totalPages}`);
      const width = measureBytes(label, 'regular', footerSize);
      stream.ascii(
        `BT 0.45 g /${PDF_FONT_NAMES.regular} ${footerSize} Tf ` +
        `1 0 0 1 ${((pageWidth - width) / 2).toFixed(2)} ${(margin - 22).toFixed(2)} Tm (`,
      );
      stream.raw(pdfStringBytes(label));
      stream.ascii(') Tj ET 0 g\n');
    }

    return stream.toUint8Array();
  });

  // --- Pass 3: objects, xref, trailer (byte offsets throughout) ------------
  const objects: Array<{ head: string; stream?: Uint8Array; tail?: string }> = [];

  const fontFirstObj = 3;
  const firstPageObj = fontFirstObj + PDF_BASE_FONTS.length; // content, page, ...
  const pageObjNumbers = renderedPages.map((_, i) => firstPageObj + i * 2 + 1);

  objects.push({ head: '<< /Type /Catalog /Pages 2 0 R >>' });
  objects.push({
    head: `<< /Type /Pages /Kids [${pageObjNumbers.map(n => `${n} 0 R`).join(' ')}] /Count ${totalPages} >>`,
  });
  for (const [, baseFont] of PDF_BASE_FONTS) {
    objects.push({
      head: `<< /Type /Font /Subtype /Type1 /BaseFont /${baseFont} /Encoding /WinAnsiEncoding >>`,
    });
  }

  const fontResources = PDF_BASE_FONTS
    .map(([name], i) => `/${name} ${fontFirstObj + i} 0 R`)
    .join(' ');

  streams.forEach((stream, i) => {
    objects.push({ head: `<< /Length ${stream.length} >>`, stream });
    objects.push({
      head:
        `<< /Type /Page /Parent 2 0 R /Resources << /Font << ${fontResources} >> >> ` +
        `/MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${firstPageObj + i * 2} 0 R >>`,
    });
  });

  const pdf = new ByteBuffer();
  pdf.ascii('%PDF-1.4\n');
  pdf.raw(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // binary marker

  const offsets: number[] = [];
  objects.forEach((object, i) => {
    offsets.push(pdf.length);
    pdf.ascii(`${i + 1} 0 obj\n${object.head}\n`);
    if (object.stream) {
      pdf.ascii('stream\n');
      pdf.raw(object.stream);
      pdf.ascii('\nendstream\n');
    }
    pdf.ascii('endobj\n');
  });

  const xrefOffset = pdf.length;
  pdf.ascii(`xref\n0 ${objects.length + 1}\n`);
  pdf.ascii('0000000000 65535 f \n');
  for (const offset of offsets) {
    pdf.ascii(`${offset.toString().padStart(10, '0')} 00000 n \n`);
  }
  pdf.ascii(
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );

  return pdf.toUint8Array();
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
