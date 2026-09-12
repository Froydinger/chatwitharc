import { cloudImageRequest } from "./cloudImageHttp.ts";
import { cloudImageDigest, cloudImageMime } from "./cloudImageProvider.ts";
import type { CloudImageMedia } from "./cloudImageTool.ts";
/** Same R2 worker/auth as legacy, stable owner/job/slot path. Raw provider bytes
 * remain recoverable by response ID if crop/upload fails. No random object keys. */
export function cloudImageMedia(
  options: {
    workerUrl: string;
    workerSecret: string;
    fetch?: typeof fetch;
    crop16x9?: (bytes: Uint8Array) => Promise<Uint8Array>;
  },
): CloudImageMedia {
  const fetcher = options.fetch ?? fetch;
  return {
    save: async (owner, job, index, raw, args) => {
      if (raw.length > 16000000 || cloudImageMime(raw) !== "image/png") {
        throw new Error("Invalid image output");
      }
      const header = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
      const width = header.getUint32(16), height = header.getUint32(20);
      if (!width || !height || width > 4096 || height > 4096) {
        throw new Error("Image dimensions exceed decoding bounds");
      }
      if (
        !/^[a-f0-9-]{36}$/i.test(owner) || !/^[a-f0-9-]{36}$/i.test(job) ||
        !Number.isInteger(index) || index < 0 || index > 2
      ) throw new Error("Invalid image object identity");
      let bytes = raw;
      if (args.aspectRatio === "16:9" && !args.transparent) {
        if (options.crop16x9) bytes = await options.crop16x9(raw);
        else {
          const { decode, Image } = await import(
            "https://deno.land/x/imagescript@1.2.17/mod.ts"
          );
          const image = await decode(raw);
          if (!(image instanceof Image)) {
            throw new Error(
              "Invalid generated image",
            );
          }
          const h = Math.round(image.width * 9 / 16);
          if (h > image.height) throw new Error("Unexpected image aspect");
          bytes = await image.crop(
            0,
            Math.floor((image.height - h) / 2),
            image.width,
            h,
          ).encode();
        }
      }
      if (
        bytes.length > 16000000 || cloudImageMime(bytes) !== "image/png"
      ) throw new Error("Invalid image output");
      const url = `${
        options.workerUrl.replace(/\/$/, "")
      }/objects/${owner}/cloud-${job}-${index}.png`;
      const existing = await cloudImageRequest(fetcher, url, {}, 16000000);
      if (existing.ok) {
        if (
          await cloudImageDigest(existing.bytes) !==
            await cloudImageDigest(bytes)
        ) throw new Error("Image object conflict");
        return url;
      }
      if (existing.status !== 404) throw new Error("Image storage unavailable");
      try {
        const uploaded = await cloudImageRequest(fetcher, url, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${options.workerSecret}`,
            "Content-Type": "image/png",
          },
          body: new Uint8Array(bytes),
        }, 1000000);
        if (uploaded.ok) return url;
      } catch {
        /* Reconcile unknown storage acceptance without provider retry. */
      }
      const saved = await cloudImageRequest(fetcher, url, {}, 16000000);
      if (
        !saved.ok ||
        await cloudImageDigest(saved.bytes) !== await cloudImageDigest(bytes)
      ) {
        throw new Error("Image upload incomplete");
      }
      return url;
    },
  };
}
