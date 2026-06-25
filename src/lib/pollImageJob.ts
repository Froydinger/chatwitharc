import { supabase } from "@/integrations/supabase/client";

export type ImageJobResult = {
  imageUrls: string[];
  fallbackModel?: string | null;
};

export type PollOptions = {
  intervalMs?: number;
  timeoutMs?: number;
};

/**
 * Polls image-job-status until the job completes or fails.
 * Throws an Error with .errorType when the job fails or polling times out.
 */
export async function pollImageJob(jobId: string, opts: PollOptions = {}): Promise<ImageJobResult> {
  const intervalMs = opts.intervalMs ?? 2000;
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const { data, error } = await supabase.functions.invoke("image-job-status", {
      body: { jobId },
    });

    if (error) {
      // Network blip — back off and try again
      await sleep(intervalMs);
      continue;
    }

    if (data?.status === "completed") {
      const urls: string[] = Array.isArray(data.imageUrls) && data.imageUrls.length > 0
        ? data.imageUrls
        : (data.imageUrl ? [data.imageUrl] : []);
      if (urls.length === 0) {
        const err: any = new Error("Job completed but returned no image");
        err.errorType = "no_image_returned";
        throw err;
      }
      return { imageUrls: urls, fallbackModel: data.fallbackModel ?? null };
    }

    if (data?.status === "failed") {
      const err: any = new Error(data.errorMessage || "Image job failed");
      err.errorType = data.errorType || "unknown";
      throw err;
    }

    await sleep(intervalMs);
  }

  const err: any = new Error("Image job timed out. Please try again.");
  err.errorType = "timeout";
  throw err;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
