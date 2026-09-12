/** Bounded headers + body, no redirect credential forwarding, no POST retry. */
export async function cloudImageRequest(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit = {},
  limit = 24000000,
  timeoutMs = 15000,
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
