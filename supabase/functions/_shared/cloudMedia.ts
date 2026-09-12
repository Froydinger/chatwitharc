/** Shared, environment-free durable INPUT contract. Not image generation/edit.
 * Bucket must be PRIVATE with owner INSERT/SELECT and no user UPDATE/overwrite.
 * Main owns bucket/RLS + endpoint wiring. Paths/hashes are not authorization:
 * workers must also verify the claimed session and actual object owner/bytes.
 */
export const CLOUD_MEDIA_BUCKET = 'cloud-chat-inputs' as const;
export const CLOUD_MEDIA_LIMITS = { images: 6, documents: 3, fileBytes: 20 * 1024 * 1024,
  totalBytes: 40 * 1024 * 1024, textChars: 400_000, extractedBytes: 4 * 1024 * 1024 } as const;
export const CLOUD_MEDIA_TYPES = {
  'image/png': ['png'], 'image/jpeg': ['jpg', 'jpeg'], 'image/webp': ['webp'], 'image/gif': ['gif'],
  'application/pdf': ['pdf'], 'text/plain': ['txt'], 'text/markdown': ['md'], 'text/html': ['html'],
  'text/csv': ['csv'], 'application/json': ['json'], 'application/xml': ['xml'], 'text/xml': ['xml'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['pptx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
} as const;
export type CloudMediaMime = keyof typeof CLOUD_MEDIA_TYPES;
export type CloudMediaScope = { ownerId: string; sessionId: string };
export type CloudMediaReference = CloudMediaScope & {
  version: 1; id: string; bucket: typeof CLOUD_MEDIA_BUCKET; path: string;
  name: string; mimeType: CloudMediaMime; size: number; sha256: string;
};
export class CloudMediaError extends Error {
  constructor(public readonly code: 'invalid' | 'owner' | 'limit' | 'unsupported' | 'integrity' | 'uncertain', message: string) {
    super(message); this.name = 'CloudMediaError';
  }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function assertCloudMediaScope(scope: CloudMediaScope) {
  if (!scope || !uuid.test(scope.ownerId) || !uuid.test(scope.sessionId)) throw new CloudMediaError('owner', 'Media requires an explicit owner and session UUID.');
}
export function cloudMediaMime(name: string, type: string): CloudMediaMime {
  if (typeof name !== 'string' || !name.trim() || name.length > 180 || /[/\\:]/.test(name)
    || [...name].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) {
    throw new CloudMediaError('invalid', 'Invalid media filename.');
  }
  const ext = name.split('.').at(-1)?.toLowerCase();
  const mime = !type || type === 'application/octet-stream'
    ? Object.keys(CLOUD_MEDIA_TYPES).find(key => (CLOUD_MEDIA_TYPES[key as CloudMediaMime] as readonly string[]).includes(ext ?? '')) : type;
  if (!mime || !Object.prototype.hasOwnProperty.call(CLOUD_MEDIA_TYPES, mime)
    || !(CLOUD_MEDIA_TYPES[mime as CloudMediaMime] as readonly string[]).includes(ext ?? '')) {
    throw new CloudMediaError('unsupported', 'Unsupported or mismatched media type. Convert unsupported images to PNG/JPEG and documents to PDF.');
  }
  return mime as CloudMediaMime;
}
export function validateCloudMediaReferences(value: unknown, scope: CloudMediaScope): CloudMediaReference[] {
  assertCloudMediaScope(scope);
  if (!Array.isArray(value) || value.length > 9) throw new CloudMediaError('invalid', 'Expected a bounded media reference list.');
  const seen = new Set<string>(); let images = 0, documents = 0, bytes = 0;
  const keys = ['version', 'id', 'ownerId', 'sessionId', 'bucket', 'path', 'name', 'mimeType', 'size', 'sha256'];
  return value.map(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length !== keys.length
      || Object.keys(raw).some(key => !keys.includes(key))) throw new CloudMediaError('invalid', 'Invalid media reference fields.');
    const r = raw as CloudMediaReference;
    if (r.version !== 1 || typeof r.id !== 'string' || !uuid.test(r.id) || r.bucket !== CLOUD_MEDIA_BUCKET
      || r.ownerId !== scope.ownerId || r.sessionId !== scope.sessionId
      || r.path !== `${scope.ownerId}/${scope.sessionId}/${r.id}` || seen.has(r.id)) {
      throw new CloudMediaError('owner', 'Media reference does not belong to this owner/session or is duplicated.');
    }
    seen.add(r.id);
    if (!Number.isSafeInteger(r.size) || r.size < 1 || r.size > CLOUD_MEDIA_LIMITS.fileBytes
      || typeof r.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(r.sha256)) throw new CloudMediaError('limit', 'Invalid media size or digest.');
    if (typeof r.mimeType !== 'string' || cloudMediaMime(r.name, r.mimeType) !== r.mimeType) throw new CloudMediaError('invalid', 'Invalid media MIME type.');
    if (r.mimeType.startsWith('image/')) images++; else documents++;
    bytes += r.size;
    if (images > CLOUD_MEDIA_LIMITS.images || documents > CLOUD_MEDIA_LIMITS.documents || bytes > CLOUD_MEDIA_LIMITS.totalBytes) {
      throw new CloudMediaError('limit', 'Media exceeds six images, three documents, or 40 MiB total. Nothing was truncated.');
    }
    return structuredClone(r);
  });
}
export async function cloudMediaDigest(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, '0')).join('');
}
/** Header validation is defense in depth, not an image decoder or virus scanner. */
export function validateCloudMediaBytes(bytes: Uint8Array, mime: CloudMediaMime) {
  const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  let valid = bytes.length > 0;
  if (mime === 'image/png') valid = starts(137, 80, 78, 71, 13, 10, 26, 10);
  if (mime === 'image/jpeg') valid = starts(255, 216, 255);
  if (mime === 'image/webp') valid = ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
  if (mime === 'image/gif') {
    valid = ['GIF87a', 'GIF89a'].includes(ascii(0, 6));
    if (valid) validateStillGif(bytes);
  }
  if (mime === 'application/pdf') valid = ascii(0, 5) === '%PDF-';
  if (mime.startsWith('application/vnd.openxmlformats')) valid = starts(80, 75, 3, 4);
  if (valid && (mime === 'image/png' || mime === 'image/webp')) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = mime === 'image/png' ? 8 : 12;
    while (offset + 8 <= bytes.length) {
      const webp = mime === 'image/webp';
      const size = view.getUint32(offset + (webp ? 4 : 0), webp);
      const kind = ascii(offset + (webp ? 0 : 4), offset + (webp ? 4 : 8));
      if (['acTL', 'ANIM', 'ANMF'].includes(kind)) throw new CloudMediaError('unsupported', 'Animated image input requires an explicit still-image conversion.');
      offset += size + (mime === 'image/png' ? 12 : 8 + (size % 2));
      if (offset > bytes.length) { valid = false; break; }
    }
    if (offset !== bytes.length) valid = false;
  }
  if (!valid) throw new CloudMediaError('integrity', 'Media bytes do not match the declared format.');
}
function validateStillGif(bytes: Uint8Array) {
  const invalid = () => { throw new CloudMediaError('unsupported', 'Only valid non-animated GIF input is supported.'); };
  if (bytes.length < 14) invalid();
  let offset = 13 + ((bytes[10] & 128) ? 3 * (1 << ((bytes[10] & 7) + 1)) : 0), frames = 0;
  const skipBlocks = () => { while (offset < bytes.length) { const length = bytes[offset++]; if (!length) return; offset += length; } invalid(); };
  while (offset < bytes.length) {
    const kind = bytes[offset++];
    if (kind === 59) { if (frames !== 1 || offset !== bytes.length) invalid(); return; }
    if (kind === 33) { offset++; skipBlocks(); }
    else if (kind === 44) {
      if (++frames > 1 || offset + 9 > bytes.length) invalid();
      const flags = bytes[offset + 8]; offset += 9 + ((flags & 128) ? 3 * (1 << ((flags & 7) + 1)) : 0);
      offset++; skipBlocks();
    } else invalid();
  }
  invalid();
}
