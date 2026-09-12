import {
  cloudFileHash,
  type CloudFileReceipt,
  type CloudFileStore,
} from "./cloudFileTool.ts";

/** Worker-only service credential. Never accept/retain the browser Authorization header.
 * Uses existing generated-files public bucket and generated_files primary key.
 * Public download semantics match legacy files; owner scope is not download privacy.
 */
export function cloudFileStore(
  options: {
    supabaseUrl: string;
    serviceRoleKey: string;
    fetch?: typeof fetch;
    /** Per request, including response body. Bounded to 1–15000ms. */
    requestTimeoutMs?: number;
  },
): CloudFileStore {
  const base = options.supabaseUrl.replace(/\/$/, "");
  const transport = options.fetch ?? fetch;
  const timeoutMs = options.requestTimeoutMs ?? 15000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15000) {
    throw new Error("Invalid file request timeout");
  }
  // Keep the deadline active through body consumption, not just headers.
  // Race explicitly so injected transports/streams cannot ignore cancellation.
  const request = async (url: string, init: RequestInit): Promise<Response> => {
    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const cancel = () => {
      void reader?.cancel().catch(() => {});
    };
    let timer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        cancel();
        reject(new Error("File request timed out"));
      }, timeoutMs);
    });
    try {
      return await Promise.race([
        deadline,
        (async () => {
          const response = await transport(url, {
            ...init,
            signal: controller.signal,
          });
          if (controller.signal.aborted) {
            void response.body?.cancel().catch(() => {});
            throw new Error("File request timed out");
          }
          reader = response.body?.getReader();
          // POST responses are never used; release their bodies immediately.
          if (init.method === "POST") {
            cancel();
            return new Response(null, {
              status: response.status,
              headers: response.headers,
            });
          }
          const limit = 6000000;
          if (Number(response.headers.get("content-length")) > limit) {
            throw new Error("File response exceeds 6MB");
          }
          const chunks: Uint8Array[] = [];
          let size = 0;
          while (reader) {
            const { done, value } = await reader.read();
            if (controller.signal.aborted) {
              throw new Error("File request timed out");
            }
            if (done) break;
            size += value.byteLength;
            if (size > limit) throw new Error("File response exceeds 6MB");
            chunks.push(value);
          }
          const bytes = new Uint8Array(size);
          let offset = 0;
          for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.length;
          }
          return new Response(response.body ? bytes : null, {
            status: response.status,
            headers: response.headers,
          });
        })(),
      ]);
    } catch (error) {
      controller.abort();
      cancel();
      throw error;
    } finally {
      clearTimeout(timer!);
    }
  };
  const headers = {
    apikey: options.serviceRoleKey,
    Authorization: `Bearer ${options.serviceRoleKey}`,
  };
  const encoded = (path: string) =>
    path.split("/").map(encodeURIComponent).join("/");
  const read = async (
    id: string,
    owner: string,
  ): Promise<CloudFileReceipt | null> => {
    const query = new URLSearchParams({
      id: `eq.${id}`,
      user_id: `eq.${owner}`,
      select:
        "id,user_id,file_name,file_url,file_type,file_size,mime_type,prompt",
      limit: "1",
    });
    const r = await request(`${base}/rest/v1/generated_files?${query}`, {
      headers,
    });
    if (!r.ok) throw new Error("File metadata read unavailable");
    const rows = await r.json();
    if (!Array.isArray(rows)) throw new Error("Invalid file metadata response");
    return rows[0] ?? null;
  };
  return {
    read,
    url: (path) =>
      `${base}/storage/v1/object/public/generated-files/${encoded(path)}`,
    put: async (path, bytes, mime) => {
      const endpoint = `${base}/storage/v1/object/generated-files/${
        encoded(path)
      }`;
      // Read existing object first: replay after upload but before metadata save.
      const reconcile = async () => {
        const r = await request(endpoint, { headers });
        if (r.status === 404) return false;
        if (!r.ok) {
          // Storage can encode missing objects as HTTP 400 with statusCode 404.
          const body = await r.json().catch(() => null);
          if (r.status === 400 && String(body?.statusCode) === "404") {
            return false;
          }
          throw new Error("File storage read unavailable");
        }
        const existing = new Uint8Array(await r.arrayBuffer());
        if (
          existing.length !== bytes.length ||
          await cloudFileHash(existing) !== await cloudFileHash(bytes)
        ) throw new Error("File object conflict");
        return true;
      };
      if (await reconcile()) return;
      try {
        const uploaded = await request(endpoint, {
          method: "POST",
          headers: { ...headers, "Content-Type": mime, "x-upsert": "false" },
          body: new Uint8Array(bytes),
        });
        if (uploaded.ok) return;
      } catch { /* Unknown upload acceptance: reconcile, never overwrite. */ }
      if (!await reconcile()) {
        throw new Error("File upload incomplete; safe to replay");
      }
    },
    commit: async (receipt) => {
      try {
        await request(`${base}/rest/v1/generated_files`, {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify(receipt),
        });
      } catch {
        /* Read back even after timeout or concurrent primary-key conflict. */
      }
      const saved = await read(receipt.id, receipt.user_id);
      if (!saved) throw new Error("File metadata incomplete; safe to replay");
      for (const key of Object.keys(receipt) as (keyof CloudFileReceipt)[]) {
        if (saved[key] !== receipt[key]) {
          throw new Error("File metadata conflict");
        }
      }
      return saved;
    },
  };
}
