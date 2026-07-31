/**
 * Video generation provider adapter.
 *
 * Everything provider-specific lives behind `VideoProvider` so the rest of the
 * stack (job table, quota, status polling, content proxy, UI) never names a
 * vendor. This matters more than usual here: OpenAI announced on 2026-03-24
 * that the Videos API and every `sora-2*` model are removed on 2026-09-24,
 * with no successor. When that lands, write a new provider object below and
 * point `getVideoProvider()` at it — nothing else has to change.
 */

export type VideoOrientation = "landscape" | "portrait";

export type VideoStatus = "processing" | "completed" | "failed";

export type CreateVideoRequest = {
  prompt: string;
  seconds: number;
  orientation: VideoOrientation;
  /** First frame for image-to-video. Must already match the provider's size. */
  referenceImage?: { bytes: Uint8Array; contentType: string };
};

export type CreateVideoResult =
  | { ok: true; providerVideoId: string }
  | { ok: false; errorType: string; errorMessage: string; debugDetail: string };

export type PollVideoResult =
  | { ok: true; status: VideoStatus; progress: number; errorType?: string; errorMessage?: string }
  | { ok: false; errorType: string; errorMessage: string; debugDetail: string };

export interface VideoProvider {
  readonly id: string;
  readonly model: string;
  /** Durations the provider actually accepts, in seconds. */
  readonly allowedSeconds: number[];
  /** Pixel size string for an orientation, e.g. "1280x720". */
  sizeFor(orientation: VideoOrientation): string;
  create(req: CreateVideoRequest): Promise<CreateVideoResult>;
  poll(providerVideoId: string): Promise<PollVideoResult>;
  /** Raw MP4 response, streamed straight to the caller. Never persisted. */
  fetchContent(providerVideoId: string): Promise<Response>;
}

function classify(status: number, rawText: string): { errorType: string; errorMessage: string; debugDetail: string } {
  let debugDetail = rawText || "Unknown video generation error";
  try {
    const json = JSON.parse(rawText);
    const detail = json.error?.message || json.message || json.error || rawText;
    debugDetail = typeof detail === "string" ? detail : JSON.stringify(detail);
  } catch {
    // Raw text is not JSON.
  }

  const lower = debugDetail.toLowerCase();
  if (
    lower.includes("safety") ||
    lower.includes("content policy") ||
    lower.includes("moderation") ||
    lower.includes("blocked") ||
    lower.includes("sentinel")
  ) {
    return {
      errorType: "content_violation",
      errorMessage: "Blocked by content safety filters. Try rephrasing your prompt.",
      debugDetail,
    };
  }

  if (status === 408) {
    return { errorType: "timeout", errorMessage: "Video generation timed out. Please try again.", debugDetail };
  }
  if (status === 429) {
    return { errorType: "rate_limit", errorMessage: "Too many video requests. Please wait a moment and try again.", debugDetail };
  }
  if (status === 402) {
    return { errorType: "payment_required", errorMessage: "Video generation credits exhausted.", debugDetail };
  }
  if (status === 404) {
    return { errorType: "expired", errorMessage: "This video is no longer available from the provider.", debugDetail };
  }
  if (status === 400) {
    return { errorType: "invalid_request", errorMessage: `Invalid request: ${debugDetail.slice(0, 200)}`, debugDetail };
  }
  if (status >= 500) {
    return { errorType: "provider_error", errorMessage: `Video model error: ${debugDetail.slice(0, 200)}`, debugDetail };
  }
  return { errorType: "unknown", errorMessage: "Video generation failed. Please try again.", debugDetail };
}

const OPENAI_BASE = "https://api.openai.com/v1";
const CREATE_TIMEOUT_MS = 60_000;
const POLL_TIMEOUT_MS = 30_000;

/**
 * OpenAI Sora 2 at 720p — the cheapest tier the Videos API offers ($0.10/s).
 * Only 4, 8 and 12 second durations are accepted; anything else 400s.
 */
function createOpenAIProvider(apiKey: string): VideoProvider {
  const authHeaders = { Authorization: `Bearer ${apiKey}` };

  return {
    id: "openai",
    model: "sora-2",
    allowedSeconds: [4, 8, 12],

    sizeFor(orientation) {
      return orientation === "portrait" ? "720x1280" : "1280x720";
    },

    async create(req) {
      const form = new FormData();
      form.append("model", "sora-2");
      form.append("prompt", req.prompt);
      form.append("seconds", String(req.seconds));
      form.append("size", this.sizeFor(req.orientation));

      if (req.referenceImage) {
        // Provider requires the first frame to match `size` exactly; the
        // caller has already resized it.
        const { bytes, contentType } = req.referenceImage;
        const copy = new Uint8Array(bytes.byteLength);
        copy.set(bytes);
        const ext = contentType.includes("jpeg") ? "jpg" : contentType.includes("webp") ? "webp" : "png";
        form.append("input_reference", new Blob([copy], { type: contentType }), `reference.${ext}`);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CREATE_TIMEOUT_MS);
      try {
        const response = await fetch(`${OPENAI_BASE}/videos`, {
          method: "POST",
          headers: authHeaders,
          body: form,
          signal: controller.signal,
        });
        const rawText = await response.text();
        if (!response.ok) return { ok: false, ...classify(response.status, rawText) };

        const parsed = JSON.parse(rawText);
        if (typeof parsed?.id !== "string" || !parsed.id) {
          return {
            ok: false,
            errorType: "no_video_returned",
            errorMessage: "The video service did not return a job id.",
            debugDetail: rawText.slice(0, 400),
          };
        }
        return { ok: true, providerVideoId: parsed.id };
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return { ok: false, ...classify(408, "Request timeout") };
        }
        return { ok: false, ...classify(500, error instanceof Error ? error.message : "Unknown fetch error") };
      } finally {
        clearTimeout(timeoutId);
      }
    },

    async poll(providerVideoId) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), POLL_TIMEOUT_MS);
      try {
        const response = await fetch(`${OPENAI_BASE}/videos/${encodeURIComponent(providerVideoId)}`, {
          headers: authHeaders,
          signal: controller.signal,
        });
        const rawText = await response.text();
        if (!response.ok) return { ok: false, ...classify(response.status, rawText) };

        const parsed = JSON.parse(rawText);
        const raw = String(parsed?.status ?? "");
        const progress = Number.isFinite(Number(parsed?.progress)) ? Number(parsed.progress) : 0;

        // The API has used both `completed`/`succeeded` and
        // `queued`/`in_progress`/`processing` across snapshots. Accept all.
        if (raw === "completed" || raw === "succeeded") {
          return { ok: true, status: "completed", progress: 100 };
        }
        if (raw === "failed" || raw === "cancelled") {
          const detail = parsed?.error?.message || parsed?.error?.code || "The video render failed.";
          const info = classify(400, JSON.stringify({ error: { message: detail } }));
          return { ok: true, status: "failed", progress, errorType: info.errorType, errorMessage: info.errorMessage };
        }
        return { ok: true, status: "processing", progress };
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return { ok: false, ...classify(408, "Poll timeout") };
        }
        return { ok: false, ...classify(500, error instanceof Error ? error.message : "Unknown fetch error") };
      } finally {
        clearTimeout(timeoutId);
      }
    },

    fetchContent(providerVideoId) {
      return fetch(`${OPENAI_BASE}/videos/${encodeURIComponent(providerVideoId)}/content`, {
        headers: authHeaders,
      });
    },
  };
}

export function getVideoProvider(): VideoProvider | null {
  const apiKey = Deno.env.get("OPENAI_API_KEY")?.trim();
  if (!apiKey) return null;
  return createOpenAIProvider(apiKey);
}

/** Provider content stays fetchable for roughly an hour after the render. */
export const CONTENT_TTL_MS = 60 * 60 * 1000;
