import {
  cloudImageRequest,
  isCloudImageTransientStatus,
} from "./cloudImageHttp.ts";
import {
  type CloudImageProvider,
  CloudImageRecoveryRequired,
  CloudImageRejected,
} from "./cloudImageTool.ts";
export async function cloudImageDigest(value: string | Uint8Array) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        typeof value === "string"
          ? new TextEncoder().encode(value)
          : new Uint8Array(value),
      ),
    ),
  ].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export function cloudImageBase64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 32768) {
    s += String.fromCharCode(...bytes.subarray(i, i + 32768));
  }
  return btoa(s);
}
export function cloudImageMime(b: Uint8Array) {
  if (
    b.length >= 24 && b[0] === 137 && b[1] === 80 && b[2] === 78 &&
    b[3] === 71 && b[4] === 13 && b[5] === 10 && b[6] === 26 && b[7] === 10
  ) return "image/png";
  if (b.length > 3 && b[0] === 255 && b[1] === 216 && b[2] === 255) {
    return "image/jpeg";
  }
  if (
    b.length > 12 && new TextDecoder().decode(b.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(b.slice(8, 12)) === "WEBP"
  ) return "image/webp";
  throw new Error("Invalid image bytes");
}
/** Only trusted, persisted owner media; no arbitrary fetch, data URL, query token or redirect. */
export function cloudImageSourceUrl(
  raw: string,
  owner: string,
  r2Url: string,
  supabaseUrl: string,
) {
  const url = new URL(raw),
    r2 = new URL(r2Url.replace(/\/$/, "") + "/objects/"),
    sb = new URL(supabaseUrl);
  if (
    url.protocol !== "https:" || url.username || url.password || url.search ||
    url.hash
  ) throw new CloudImageRejected("Invalid source URL");
  const path = decodeURIComponent(url.pathname);
  if (
    path.includes("\\") || path.split("/").some((s) => s === "." || s === "..")
  ) throw new CloudImageRejected("Invalid source path");
  if (url.origin === r2.origin && path.startsWith(`${r2.pathname}${owner}/`)) {
    return url.href;
  }
  if (
    url.origin === sb.origin &&
    path.startsWith(`/storage/v1/object/public/avatars/${owner}/`)
  ) return url.href;
  throw new CloudImageRejected("Image source is not owner media");
}
export function cloudImageProvider(
  options: {
    apiKey: string;
    r2WorkerUrl: string;
    supabaseUrl: string;
    fetch?: typeof fetch;
  },
): CloudImageProvider {
  const fetcher = options.fetch ?? fetch;
  const headers = {
    Authorization: `Bearer ${options.apiKey}`,
    "Content-Type": "application/json",
  };
  return {
    start: async (args, owner, key, index, beforeSubmit) => {
      const content: Record<string, unknown>[] = [{
        type: "input_text",
        text: args.prompt +
          (args.transparent
            ? "\nReturn true transparent alpha, never a checkerboard or matte."
            : args.aspectRatio === "16:9"
            ? "\nPlace all meaningful content within the centered 1536x864 region of the 1536x1024 canvas. Put uniform black letterbox bars exactly 80 pixels high at top and bottom; these bars will be cropped."
            : ""),
      }];
      // Source failures happen before provider acceptance and are safe to refund.
      try {
        let total = 0;
        for (const raw of args.sourceUrls) {
          const url = cloudImageSourceUrl(
            raw,
            owner,
            options.r2WorkerUrl,
            options.supabaseUrl,
          );
          const r = await cloudImageRequest(fetcher, url, {}, 16000000);
          if (!r.ok) throw new Error("Source unavailable");
          total += r.bytes.length;
          if (total > 16000000) {
            throw new Error("Combined image sources exceed limit");
          }
          content.push({
            type: "input_image",
            image_url: `data:${cloudImageMime(r.bytes)};base64,${
              cloudImageBase64(r.bytes)
            }`,
          });
        }
      } catch {
        throw new CloudImageRejected(
          "Image source unavailable or unauthorized",
        );
      }
      if (beforeSubmit && !await beforeSubmit()) {
        throw new CloudImageRejected(
          "Image claim lost before provider submission",
        );
      }
      const size = args.aspectRatio === "source"
        ? "auto"
        : ["2:3", "3:4", "9:16"].includes(args.aspectRatio)
        ? "1024x1536"
        : args.aspectRatio === "1:1"
        ? "1024x1024"
        : "1536x1024";
      const r = await cloudImageRequest(
        fetcher,
        "https://api.openai.com/v1/responses",
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: "gpt-5.6-luna",
            reasoning: { effort: "low" },
            background: true,
            store: true,
            metadata: {
              cloud_image_key: await cloudImageDigest(key),
              cloud_image_slot: String(index),
            },
            input: [{ role: "user", content }],
            instructions:
              "Execute exactly one image generation tool call using the supplied prompt and references. Do not perform other tasks.",
            tools: [{
              type: "image_generation",
              model: args.model,
              action: args.kind,
              size,
              quality: args.model === "gpt-image-2.5-sunburst"
                ? "high"
                : "medium",
              output_format: "png",
              background: args.transparent ? "transparent" : "auto",
            }],
            tool_choice: { type: "image_generation" },
            max_tool_calls: 1,
            max_output_tokens: 1500,
          }),
        },
        24000000,
      );
      // Only explicit rejection is refundable. Timeout/5xx/parse failures are unknown.
      if ([400, 401, 403, 404, 422, 429].includes(r.status)) {
        throw new CloudImageRejected("Image request rejected");
      }
      if (!r.ok) throw new Error("Image acceptance unknown");
      const data = r.json();
      if (
        typeof data.id !== "string" || !/^resp_[A-Za-z0-9_-]+$/.test(data.id)
      ) throw new Error("Missing image response ID");
      return data.id;
    },
    poll: async (id, key, index) => {
      if (!/^resp_[A-Za-z0-9_-]+$/.test(id)) {
        throw new Error("Invalid response ID");
      }
      let r;
      try {
        r = await cloudImageRequest(
          fetcher,
          `https://api.openai.com/v1/responses/${id}`,
          { headers },
          24000000,
        );
      } catch (error) {
        // GET polling is safe to repeat: the paid POST and response ID are
        // already persisted. Treat a transport deadline as still pending so
        // the durable worker can try again on its next lease.
        if (
          error instanceof Error && error.message === "Image network timeout"
        ) {
          return { state: "pending" };
        }
        throw error;
      }
      if (r.status === 404) throw new CloudImageRecoveryRequired(id);
      // OpenAI may briefly return a rate limit or upstream gateway error while
      // a background response is still running. These are not image failures
      // and must not consume the cloud run's terminal attempt budget.
      if (isCloudImageTransientStatus(r.status)) {
        return { state: "pending" };
      }
      if (!r.ok) throw new Error("Image polling unavailable");
      const data = r.json();
      if (
        data.id !== id ||
        data.metadata?.cloud_image_key !== await cloudImageDigest(key) ||
        data.metadata?.cloud_image_slot !== String(index)
      ) throw new Error("Image provider receipt mismatch");
      if (["queued", "in_progress"].includes(data.status)) {
        return { state: "pending" };
      }
      if (["failed", "cancelled", "incomplete"].includes(data.status)) {
        return { state: "failed" };
      }
      if (data.status !== "completed") {
        throw new Error("Unknown image response status");
      }
      const outputs = Array.isArray(data.output)
        ? data.output.filter((o: Record<string, unknown>) =>
          o.type === "image_generation_call" && o.status === "completed"
        )
        : [];
      if (outputs.length !== 1) return { state: "failed" };
      const b64 = outputs[0].result;
      if (typeof b64 !== "string" || b64.length > 22000000) {
        throw new Error("Invalid image output");
      }
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      if (cloudImageMime(bytes) !== "image/png") {
        throw new Error("Expected PNG output");
      }
      return { state: "done", bytes };
    },
  };
}
