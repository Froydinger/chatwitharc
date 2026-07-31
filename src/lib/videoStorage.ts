/**
 * Local-only storage for generated videos.
 *
 * Videos are NOT uploaded to Supabase Storage or R2 — a few MB per clip would
 * fill the project's buckets fast, so the browser holds the only copy. That
 * has consequences the UI has to be honest about:
 *
 *  - Clearing site data / cookies deletes them.
 *  - They do not follow the user to another device or browser.
 *  - The provider only re-serves the file for about an hour after the render,
 *    so once that lapses an un-downloaded clip is gone for good.
 *
 * MessageBubble renders an "unavailable" placeholder whenever a video message
 * has no blob here, which is the expected state on a second device.
 *
 * IndexedDB rather than localStorage because localStorage caps out around 5MB
 * total and stores strings only.
 */

const DB_NAME = "arc-video-cache";
const DB_VERSION = 1;
const STORE = "videos";

export type StoredVideoMeta = {
  jobId: string;
  prompt: string;
  seconds: number;
  size: string;
  createdAt: number;
  byteSize: number;
};

type StoredVideo = StoredVideoMeta & { blob: Blob };

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("This browser cannot store videos locally."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "jobId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open the local video cache."));
  });
  // A failed open must not poison every later call.
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = run(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result as T);
        request.onerror = () => reject(request.error ?? new Error("Local video cache error"));
      }),
  );
}

export async function saveVideo(meta: Omit<StoredVideoMeta, "byteSize">, blob: Blob): Promise<void> {
  const record: StoredVideo = { ...meta, byteSize: blob.size, blob };
  await tx("readwrite", (store) => store.put(record) as IDBRequest<IDBValidKey>);
}

export async function getVideoBlob(jobId: string): Promise<Blob | null> {
  try {
    const record = await tx<StoredVideo | undefined>("readonly", (store) => store.get(jobId));
    return record?.blob ?? null;
  } catch {
    return null;
  }
}

export async function hasVideo(jobId: string): Promise<boolean> {
  return (await getVideoBlob(jobId)) !== null;
}

export async function deleteVideo(jobId: string): Promise<void> {
  try {
    await tx("readwrite", (store) => store.delete(jobId) as unknown as IDBRequest<undefined>);
  } catch {
    // Nothing to do — a missing entry is the desired end state anyway.
  }
}

export async function listVideos(): Promise<StoredVideoMeta[]> {
  try {
    const records = await tx<StoredVideo[]>("readonly", (store) => store.getAll());
    return records
      .map(({ blob: _blob, ...meta }) => meta)
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export async function totalVideoBytes(): Promise<number> {
  const all = await listVideos();
  return all.reduce((sum, v) => sum + (v.byteSize || 0), 0);
}

export async function clearAllVideos(): Promise<void> {
  try {
    await tx("readwrite", (store) => store.clear() as unknown as IDBRequest<undefined>);
  } catch {
    // Ignore — cache clearing is best-effort.
  }
}

/**
 * Object URLs are per-document and leak if they aren't revoked, so hand out
 * one shared URL per job and let callers release it when the last consumer is
 * done.
 */
const objectUrls = new Map<string, { url: string; refs: number }>();

export async function getVideoObjectUrl(jobId: string): Promise<string | null> {
  const existing = objectUrls.get(jobId);
  if (existing) {
    existing.refs += 1;
    return existing.url;
  }
  const blob = await getVideoBlob(jobId);
  if (!blob) return null;

  // Two callers can race through the await above (React StrictMode remounts
  // do exactly this). Re-check rather than clobbering the map entry, which
  // would strand the first caller's URL with no way to revoke it.
  const raced = objectUrls.get(jobId);
  if (raced) {
    raced.refs += 1;
    return raced.url;
  }

  const url = URL.createObjectURL(blob);
  objectUrls.set(jobId, { url, refs: 1 });
  return url;
}

export function releaseVideoObjectUrl(jobId: string): void {
  const entry = objectUrls.get(jobId);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs <= 0) {
    URL.revokeObjectURL(entry.url);
    objectUrls.delete(jobId);
  }
}

/** Trigger a save-to-device download for a cached clip. */
export async function downloadVideo(jobId: string, fileName?: string): Promise<boolean> {
  const blob = await getVideoBlob(jobId);
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName || `arc-video-${jobId}.mp4`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Give the browser a beat to start the download before dropping the URL.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${Math.round(bytes / 1024)} KB`;
  return `${mb.toFixed(1)} MB`;
}
