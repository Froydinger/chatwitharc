type ImageKind = "generated" | "edited";

type R2Config = { workerUrl: string; workerSecret: string };

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function getConfig(): R2Config {
  return {
    workerUrl: requiredEnv("R2_WORKER_URL").replace(/\/$/, ""),
    workerSecret: requiredEnv("R2_WORKER_SECRET"),
  };
}

function decodeDataUrl(source: string): { bytes: Uint8Array; contentType: string } {
  const match = source.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) throw new Error("Invalid image data URL");
  const contentType = match[1] || "image/png";
  const binary = match[2] ? atob(match[3]) : decodeURIComponent(match[3]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, contentType };
}

function extensionFor(contentType: string): string {
  const mime = contentType.split(";", 1)[0].trim().toLowerCase();
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  if (mime === "image/avif") return "avif";
  return "png";
}

async function readImage(source: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  if (source.startsWith("data:")) return decodeDataUrl(source);
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Failed to fetch generated image: ${response.status}`);
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") || "image/png",
  };
}

function encodeObjectKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function objectKeyFromPublicUrl(url: string, config: R2Config): string | null {
  const publicBase = new URL(`${config.workerUrl}/objects/`);
  const candidate = new URL(url);
  if (candidate.origin !== publicBase.origin || !candidate.pathname.startsWith(publicBase.pathname)) return null;
  return candidate.pathname.slice(publicBase.pathname.length).split("/").map(decodeURIComponent).join("/");
}

export async function uploadImageToR2(
  source: string,
  options: { userId: string; kind: ImageKind; index?: number },
): Promise<string> {
  const config = getConfig();
  const { bytes, contentType } = await readImage(source);
  const suffix = typeof options.index === "number" ? `-${options.index + 1}` : "";
  const key = `${options.userId}/${options.kind}-${Date.now()}-${crypto.randomUUID()}${suffix}.${extensionFor(contentType)}`;
  const objectUrl = `${config.workerUrl}/objects/${encodeObjectKey(key)}`;
  const response = await fetch(objectUrl, {
    method: "PUT",
    headers: { "Authorization": `Bearer ${config.workerSecret}`, "Content-Type": contentType },
    body: copyToArrayBuffer(bytes),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`R2 upload failed (${response.status}): ${detail}`);
  }
  return objectUrl;
}

export async function deleteImageFromR2(url: string, userId: string): Promise<boolean> {
  const config = getConfig();
  const key = objectKeyFromPublicUrl(url, config);
  if (!key || !key.startsWith(`${userId}/`)) return false;
  const response = await fetch(`${config.workerUrl}/objects/${encodeObjectKey(key)}`, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${config.workerSecret}` },
  });
  if (!response.ok && response.status !== 404) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`R2 delete failed (${response.status}): ${detail}`);
  }
  return true;
}
