/** Bounded headers + body, no redirect credential forwarding, no POST retry. */
// Image generation is asynchronous, but the provider can still take longer
// than an ordinary chat request to acknowledge or return a status response.
// Keep the transport patient; callers decide whether the operation is safe to
// retry, and this module never retries a paid POST.
export const CLOUD_IMAGE_REQUEST_TIMEOUT_MS = 60000;
export function isCloudImageTransientStatus(status: number) {
  return [408, 409, 425, 429].includes(status) ||
    (status >= 500 && status <= 599);
}
export async function cloudImageRequest(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit = {},
  limit = 24000000,
  timeoutMs = CLOUD_IMAGE_REQUEST_TIMEOUT_MS,
) {
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timer: ReturnType<typeof setTimeout>;
  const cancel = () => {
    void reader?.cancel().catch(() => {});
  };
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      cancel();
      reject(new Error("Image network timeout"));
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      timeout,
      (async () => {
        const response = await fetcher(url, {
          ...init,
          signal: controller.signal,
          redirect: "error",
        });
        if (controller.signal.aborted) {
          void response.body?.cancel().catch(() => {});
          throw new Error("Image network timeout");
        }
        reader = response.body?.getReader();
        if (
          Number(response.headers.get("content-length")) > limit
        ) throw new Error("Image response too large");
        const chunks: Uint8Array[] = [];
        let length = 0;
        while (reader) {
          const { done, value } = await reader.read();
          if (controller.signal.aborted) {
            throw new Error("Image network timeout");
          }
          if (done) break;
          length += value.length;
          if (length > limit) throw new Error("Image response too large");
          chunks.push(value);
        }
        const bytes = new Uint8Array(length);
        let at = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, at);
          at += chunk.length;
        }
        return {
          status: response.status,
          ok: response.ok,
          bytes,
          json: () => JSON.parse(new TextDecoder().decode(bytes)),
        };
      })(),
    ]);
  } catch (error) {
    controller.abort();
    cancel();
    throw error;
  } finally {
    clearTimeout(timer!);
  }
}
