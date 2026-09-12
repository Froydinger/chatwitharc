import JSZip from 'npm:jszip@3.10.1';
import { CloudMediaError, CLOUD_MEDIA_LIMITS, type CloudMediaMime } from './cloudMedia.ts';

/** Bound archives BEFORE JSZip inflates entries: no ZIP64, encryption, traversal,
 * duplicate paths, excessive entries, declared expansion or external fetching.
 * Input is never executed, rendered as HTML, or interpreted as instructions.
 */
function archiveEntries(bytes: Uint8Array): Map<string, number> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fail = () => { throw new CloudMediaError('unsupported', 'Unsupported or unsafe Office archive. Export it to PDF or plain text.'); };
  if (bytes.length < 22) fail();
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === bytes.length) { end = i; break; }
  }
  if (end < 0 || view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) fail();
  const count = view.getUint16(end + 10, true), length = view.getUint32(end + 12, true);
  let position = view.getUint32(end + 16, true), total = 0;
  if (count < 1 || count > 2000 || view.getUint16(end + 8, true) !== count || position + length !== end) fail();
  const entries = new Map<string, number>();
  for (let i = 0; i < count; i++) {
    if (position + 46 > end || view.getUint32(position, true) !== 0x02014b50) fail();
    const flags = view.getUint16(position + 8, true), method = view.getUint16(position + 10, true);
    const size = view.getUint32(position + 24, true), nameLength = view.getUint16(position + 28, true);
    const next = position + 46 + nameLength + view.getUint16(position + 30, true) + view.getUint16(position + 32, true);
    if (flags & 1 || ![0, 8].includes(method) || next > end || size > CLOUD_MEDIA_LIMITS.extractedBytes
      || (total += size) > CLOUD_MEDIA_LIMITS.extractedBytes) fail();
    let name: string;
    try { name = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(position + 46, position + 46 + nameLength)); }
    catch { fail(); }
    if (!name! || name!.length > 240 || /[\\:]/.test(name!) || [...name!].some(c => c.charCodeAt(0) < 32) || name!.startsWith('/')
      || name!.split('/').some(part => part === '.' || part === '..') || entries.has(name!)) fail();
    const local = view.getUint32(position + 42, true);
    if (local + 30 > position || view.getUint32(local, true) !== 0x04034b50) fail();
    entries.set(name!, size); position = next;
  }
  if (position !== end) fail();
  return entries;
}
function decode(bytes: Uint8Array): string {
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    if (text.includes('\0')) throw new Error();
    return text;
  } catch { throw new CloudMediaError('unsupported', 'Document must contain valid UTF-8 text. Convert its encoding before submitting.'); }
}
/** CSV stays complete text, avoiding the provider's first-1000-row spreadsheet
 * augmentation. Office XML is preserved in full with cell references/shared
 * strings/relationships, not flattened or silently truncated. Embedded visuals
 * or binaries require a PDF conversion instead of pretending they were read.
 */
export async function extractCloudDocument(bytes: Uint8Array, mime: CloudMediaMime): Promise<string> {
  if (!mime.startsWith('application/vnd.openxmlformats')) {
    if (mime.startsWith('image/') || mime === 'application/pdf') throw new CloudMediaError('invalid', 'Binary images/PDFs require native model input.');
    const text = decode(bytes);
    if (text.length > CLOUD_MEDIA_LIMITS.textChars) throw new CloudMediaError('limit', 'Document text exceeds the limit. Nothing was truncated.');
    return text;
  }
  const entries = archiveEntries(bytes);
  const required = mime.includes('wordprocessingml') ? 'word/document.xml'
    : mime.includes('presentationml') ? 'ppt/presentation.xml' : 'xl/workbook.xml';
  if (!entries.has('[Content_Types].xml') || !entries.has(required)) throw new CloudMediaError('integrity', 'Office content does not match its declared document type.');
  for (const name of entries.keys()) {
    if (/\/(media|charts|embeddings)\//i.test(name)
      || (!name.endsWith('/') && !/\.(xml|rels)$/i.test(name) && !/^docProps\/thumbnail\.(jpeg|jpg|png)$/i.test(name))) {
      throw new CloudMediaError('unsupported', 'This Office file includes visual or embedded content. Convert it to PDF to preserve that content.');
    }
  }
  const archive = await JSZip.loadAsync(bytes, { createFolders: false });
  const parts: Array<{ path: string; xml: string }> = [];
  for (const [path, size] of entries) {
    if (!/\.(xml|rels)$/i.test(path)) continue;
    const file = archive.file(path);
    if (!file) throw new CloudMediaError('integrity', 'Office archive entry is missing.');
    // Stop output as soon as the bound is crossed, including forged ZIP size
    // declarations. file.async() would allocate the entire decompression first.
    const content = await new Promise<Uint8Array>((resolve, reject) => {
      const chunks: Uint8Array[] = []; let length = 0;
      // JSZip 3.10.1 implements this streaming API but omits it on JSZipObject
      // in index.d.ts (async() itself delegates to this exact method).
      const stream = (file as typeof file & {
        internalStream(type: 'uint8array'): JSZip.JSZipStreamHelper<Uint8Array>;
      }).internalStream('uint8array');
      stream.on('data', chunk => {
        length += chunk.length;
        if (length > size || length > CLOUD_MEDIA_LIMITS.extractedBytes) {
          stream.pause(); reject(new CloudMediaError('limit', 'Office expansion exceeded the declared size.')); return;
        }
        chunks.push(chunk);
      }).on('error', () => reject(new CloudMediaError('integrity', 'Office archive could not be decoded.')))
        .on('end', () => {
          const output = new Uint8Array(length); let offset = 0;
          for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
          resolve(output);
        }).resume();
    });
    if (content.length !== size) throw new CloudMediaError('integrity', 'Office archive length mismatch.');
    const xml = decode(content);
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new CloudMediaError('unsupported', 'XML declarations with entities are not supported.');
    parts.push({ path, xml });
  }
  const text = JSON.stringify({ format: 'complete-office-xml', parts });
  if (text.length > CLOUD_MEDIA_LIMITS.textChars) throw new CloudMediaError('limit', 'Office content exceeds the limit. Nothing was truncated.');
  return text;
}
