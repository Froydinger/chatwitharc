import { assertCloudMediaScope, cloudMediaDigest, cloudMediaMime, CLOUD_MEDIA_BUCKET, CLOUD_MEDIA_LIMITS,
  CloudMediaError, validateCloudMediaBytes, validateCloudMediaReferences } from '../../supabase/functions/_shared/cloudMedia.ts';
import type { CloudMediaReference, CloudMediaScope } from '../../supabase/functions/_shared/cloudMedia.ts';
export type { CloudMediaReference, CloudMediaScope };
export interface CloudMediaCapturePorts {
  currentOwnerId(): Promise<string | null>;
  /** PRIVATE immutable object upload, upsert:false. Never public avatars. */
  upload(reference: CloudMediaReference, body: Blob, options: { upsert: false; signal?: AbortSignal }): Promise<void>;
  /** Explicit read-only reconciliation. True only after trusted byte/hash check;
   * user-supplied storage metadata alone is not proof of object integrity. */
  verify(reference: CloudMediaReference, options: { signal?: AbortSignal }): Promise<boolean>;
}
/** Prepare once, retain this capture across retries. No network or storage side
 * effects. Empty/unsupported/oversized input rejects, never strips attachments.
 * Files stay local until upload() explicitly runs; JSON contains references only.
 */
export async function prepareCloudMediaCapture(files: readonly File[], scope: CloudMediaScope) {
  assertCloudMediaScope(scope);
  const capturedScope = structuredClone(scope), bodies = new Map<string, Blob>();
  if (!files.length || files.length > 9) throw new CloudMediaError('limit', 'Select one to nine supported attachments.');
  let total = 0;
  const manifest = files.map(file => {
    if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > CLOUD_MEDIA_LIMITS.fileBytes
      || (total += file.size) > CLOUD_MEDIA_LIMITS.totalBytes) throw new CloudMediaError('limit', 'Attachment size exceeds the durable input limit.');
    const id = crypto.randomUUID(), mimeType = cloudMediaMime(file.name, file.type);
    const reference: CloudMediaReference = { version: 1, ...capturedScope, id, bucket: CLOUD_MEDIA_BUCKET,
      path: `${capturedScope.ownerId}/${capturedScope.sessionId}/${id}`, name: file.name, mimeType, size: file.size, sha256: '0'.repeat(64) };
    bodies.set(id, file.slice(0, file.size, mimeType));
    return reference;
  });
  validateCloudMediaReferences(manifest, capturedScope);
  for (const ref of manifest) {
    const bytes = new Uint8Array(await bodies.get(ref.id)!.arrayBuffer());
    validateCloudMediaBytes(bytes, ref.mimeType); ref.sha256 = await cloudMediaDigest(bytes);
  }
  const attempted = new Set<string>(), verified = new Set<string>(); let active = false;
  const refs = () => structuredClone(manifest);
  const owner = async (ports: CloudMediaCapturePorts, signal?: AbortSignal) => {
    signal?.throwIfAborted();
    if (await ports.currentOwnerId() !== capturedScope.ownerId) throw new CloudMediaError('owner', 'Attachment owner changed.');
    signal?.throwIfAborted();
  };
  return {
    references: refs,
    /** One upload attempt per object. Lost acknowledgements require verify(),
     * never automatic resubmission, a fresh UUID, or a base64 fallback. */
    async upload(ports: CloudMediaCapturePorts, signal?: AbortSignal) {
      if (active) throw new CloudMediaError('uncertain', 'Attachment operation is already pending.');
      active = true;
      try {
        for (const ref of manifest) {
          await owner(ports, signal);
          if (verified.has(ref.id)) continue;
          if (attempted.has(ref.id)) throw new CloudMediaError('uncertain', 'Upload outcome is unknown. Verify the existing object before proceeding.');
          attempted.add(ref.id);
          try { await ports.upload(structuredClone(ref), bodies.get(ref.id)!, { upsert: false, signal }); }
          catch { throw new CloudMediaError('uncertain', 'Upload was not confirmed. Verify the existing object; no upload was retried.'); }
          await owner(ports, signal); verified.add(ref.id);
        }
        return refs();
      } finally { active = false; }
    },
    async verify(ports: CloudMediaCapturePorts, signal?: AbortSignal) {
      if (active) throw new CloudMediaError('uncertain', 'Attachment operation is already pending.');
      active = true;
      try {
        for (const ref of manifest) {
          await owner(ports, signal);
          if (!await ports.verify(structuredClone(ref), { signal })) throw new CloudMediaError('uncertain', 'Attachment is missing or not yet verified. No upload was retried.');
          await owner(ports, signal); verified.add(ref.id);
        }
        return refs();
      } finally { active = false; }
    },
  };
}
