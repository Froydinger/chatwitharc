import { supabase } from "@/integrations/supabase/client";
import { saveVideo } from "@/lib/videoStorage";

export type VideoJobResult = {
  jobId: string;
  seconds: number;
  size: string;
  /** Bytes landed in IndexedDB. The clip never touches Supabase Storage. */
  byteSize: number;
};

export type VideoPollOptions = {
  intervalMs?: number;
  timeoutMs?: number;
  onProgress?: (progress: number) => void;
};

/**
 * Polls video-job-status until the render settles, then pulls the MP4 through
 * the video-content proxy and files it in the browser's local cache.
 *
 * Renders run long (tens of seconds to a few minutes) and the provider only
 * serves the finished file for about an hour, so the download happens
 * immediately on completion rather than lazily at play time.
 */
export async function pollVideoJob(jobId: string, opts: VideoPollOptions = {}): Promise<VideoJobResult> {
  const intervalMs = opts.intervalMs ?? 4000;
  const timeoutMs = opts.timeoutMs ?? 600_000; // 10 min — video is not fast
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const { data, error } = await supabase.functions.invoke("video-job-status", {
      body: { jobId },
    });

    if (error) {
      // Network blip — back off and try again rather than killing a live render.
      await sleep(intervalMs);
      continue;
    }

    if (typeof data?.progress === "number") {
      opts.onProgress?.(data.progress);
    }

    if (data?.status === "completed") {
      const blob = await downloadVideoContent(jobId);
      await saveVideo(
        {
          jobId,
          prompt: data.prompt ?? "",
          seconds: Number(data.seconds) || 0,
          size: data.size ?? "",
          createdAt: Date.now(),
        },
        blob,
      );
      return {
        jobId,
        seconds: Number(data.seconds) || 0,
        size: data.size ?? "",
        byteSize: blob.size,
      };
    }

    if (data?.status === "failed") {
      const err: any = new Error(data.errorMessage || "Video generation failed");
      err.errorType = data.errorType || "unknown";
      throw err;
    }

    await sleep(intervalMs);
  }

  const err: any = new Error("Video generation timed out. Please try again.");
  err.errorType = "timeout";
  throw err;
}

/**
 * Fetched directly rather than through `supabase.functions.invoke`, which
 * decodes anything that isn't JSON/octet-stream as text and would corrupt the
 * MP4 bytes.
 */
async function downloadVideoContent(jobId: string): Promise<Blob> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    const err: any = new Error("Your session expired. Please sign in again.");
    err.errorType = "auth_error";
    throw err;
  }

  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  const response = await fetch(`${baseUrl}/functions/v1/video-content`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jobId }),
  });

  if (!response.ok) {
    let message = "Could not download the finished video.";
    let errorType = "download_failed";
    try {
      const body = await response.json();
      if (body?.error) message = body.error;
      if (body?.errorType) errorType = body.errorType;
    } catch {
      // Non-JSON error body — keep the default message.
    }
    const err: any = new Error(message);
    err.errorType = errorType;
    throw err;
  }

  const blob = await response.blob();
  if (blob.size === 0) {
    const err: any = new Error("The finished video came back empty. Please try again.");
    err.errorType = "empty_video";
    throw err;
  }
  return blob;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
