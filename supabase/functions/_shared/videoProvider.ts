/** Provider-neutral contract retained for a future video integration. */
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

/** No provider is enabled. New generation must stop before reserving quota. */
export function getVideoProvider(): VideoProvider | null {
  return null;
}

export const CONTENT_TTL_MS = 60 * 60 * 1000;
