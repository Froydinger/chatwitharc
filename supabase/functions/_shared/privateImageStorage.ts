const PRIVATE_BUCKET = "private-user-images";

export interface ParsedPrivateImageReference {
  ownerId: string;
  path: string;
}

export function makePrivateImageReference(path: string): string {
  return `private-image://${PRIVATE_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export function parsePrivateImageReference(value: string): ParsedPrivateImageReference | null {
  if (!value.startsWith("private-image:")) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "private-image:" || url.hostname !== PRIVATE_BUCKET || url.search || url.hash) return null;
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    if (parts.length < 2 || parts.some((part) => !part || part === "." || part === ".." || part.includes("/") || part.includes("\\"))) return null;
    return { ownerId: parts[0], path: parts.join("/") };
  } catch {
    return null;
  }
}

export async function uploadPrivateImage(
  supabaseAdmin: any,
  source: string,
  options: { userId: string; kind: "generated" | "edited" },
): Promise<string> {
  let bytes: Uint8Array;
  let contentType: string;
  if (source.startsWith("data:")) {
    const match = source.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
    if (!match) throw new Error("Invalid image data URL");
    contentType = match[1] || "image/png";
    const binary = match[2] ? atob(match[3]) : decodeURIComponent(match[3]);
    bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } else {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`Failed to fetch generated image: ${response.status}`);
    contentType = response.headers.get("content-type")?.split(";", 1)[0] || "image/png";
    bytes = new Uint8Array(await response.arrayBuffer());
  }
  if (!contentType.startsWith("image/") || bytes.length === 0 || bytes.length > 20 * 1024 * 1024) {
    throw new Error("Generated image has invalid type or size");
  }
  const ext = contentType === "image/jpeg" ? "jpg"
    : contentType === "image/webp" ? "webp"
    : contentType === "image/gif" ? "gif"
    : contentType === "image/avif" ? "avif"
    : contentType === "image/heic" ? "heic"
    : contentType === "image/heif" ? "heif"
    : "png";
  const path = `${options.userId}/${options.kind}-${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabaseAdmin.storage.from(PRIVATE_BUCKET).upload(path, bytes, {
    contentType,
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw new Error(`Private image upload failed: ${error.message}`);
  return makePrivateImageReference(path);
}

export async function downloadPrivateImage(
  supabaseAdmin: any,
  reference: string,
  expectedOwnerId: string,
): Promise<Blob | null> {
  const parsed = parsePrivateImageReference(reference);
  if (!parsed) return null;
  if (parsed.ownerId !== expectedOwnerId) throw new Error("Private image does not belong to this account");
  const { data, error } = await supabaseAdmin.storage.from(PRIVATE_BUCKET).download(parsed.path);
  if (error || !data) throw new Error(error?.message || "Private image not found");
  return data;
}
