/** Nano Banana 2 via Google's Interactions API. Chat still uses OpenAI compatibility. */
export const ARC_IMAGE_FLASH_MODEL = "gemini-3.1-flash-image";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const ASPECTS = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];
type ImageInput = { data: string; mime_type: string };
type GatewayResult = { ok: boolean; status: number; rawText: string };

export function imageFlashAspect(aspect: string, width = 0, height = 0): string {
  if (ASPECTS.includes(aspect)) return aspect;
  if (aspect === "source" && width > 0 && height > 0) {
    const ratio = width / height;
    return ASPECTS.reduce((best, next) => {
      const distance = (value: string) => {
        const [w, h] = value.split(":").map(Number);
        return Math.abs(Math.log(ratio / (w / h)));
      };
      return distance(next) < distance(best) ? next : best;
    }, "1:1");
  }
  return "3:2";
}

/** Only completed model output counts, never thought images or input echoes. One call = one image. */
export function extractImageFlashOutput(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const interaction = payload as Record<string, unknown>;
  if (interaction.status !== "completed" || !Array.isArray(interaction.steps)) return null;
  let image: string | null = null;
  for (const step of interaction.steps) {
    if (step?.type !== "model_output" || !Array.isArray(step.content)) continue;
    for (const block of step.content) {
      // Request PNG and fail closed on URI-only or another MIME rather than saving mislabeled bytes.
      if (block?.type === "image" && block.mime_type === "image/png" &&
        typeof block.data === "string" && block.data.length > 0 &&
        block.data.length <= 32 * 1024 * 1024 && /^[A-Za-z0-9+/]+={0,2}$/.test(block.data)) image = block.data;
    }
  }
  return image;
}

export async function callImageFlash(options: {
  apiKey: string | undefined;
  prompt: string;
  aspect: string;
  count: number;
  images?: ImageInput[];
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<GatewayResult> {
  if (!options.apiKey?.trim()) return { ok: false, status: 503, rawText: "Arc Image Flash is unavailable." };
  if (!Number.isInteger(options.count) || options.count < 1 || options.count > 3) {
    return { ok: false, status: 400, rawText: "Invalid image count." };
  }
  const body = JSON.stringify({
    model: ARC_IMAGE_FLASH_MODEL,
    input: [{ type: "text", text: options.prompt }, ...(options.images ?? []).map(image => ({ type: "image", ...image }))],
    response_format: { type: "image", mime_type: "image/png", aspect_ratio: imageFlashAspect(options.aspect), image_size: "1K" },
    store: false,
    stream: false,
  });
  const single = async (): Promise<GatewayResult> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 180_000);
    try {
      const response = await (options.fetchImpl ?? fetch)(ENDPOINT, {
        method: "POST", headers: { "x-goog-api-key": options.apiKey!, "Content-Type": "application/json" },
        body, signal: controller.signal,
      });
      // Do not return/log raw provider errors: they can echo private input or key material.
      if (!response.ok) {
        await response.body?.cancel();
        return { ok: false, status: response.status, rawText: response.status === 400
          ? "Arc Image Flash could not process this image request."
          : "Arc Image Flash could not finish the image. Please try again." };
      }
      const image = extractImageFlashOutput(await response.json());
      return image ? { ok: true, status: 200, rawText: JSON.stringify({ data: [{ b64_json: image }] }) }
        : { ok: false, status: 502, rawText: "Arc Image Flash returned no completed image. Please try again." };
    } catch {
      return { ok: false, status: controller.signal.aborted ? 408 : 502,
        rawText: controller.signal.aborted ? "Image request timed out." : "Arc Image Flash could not finish the image. Please try again." };
    } finally { clearTimeout(timer); }
  };
  // No automatic retry after a POST: it could create another paid image.
  const results = await Promise.all(Array.from({ length: options.count }, single));
  const data = results.filter(result => result.ok).flatMap(result => JSON.parse(result.rawText).data);
  return data.length ? { ok: true, status: 200, rawText: JSON.stringify({ data }) } : results[0];
}

export async function imageFlashInputs(blobs: { blob: Blob }[]): Promise<ImageInput[]> {
  return Promise.all(blobs.map(async ({ blob }) => {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    return { data: btoa(binary), mime_type: blob.type };
  }));
}
