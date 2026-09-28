import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const PRIVATE_USER_IMAGES_BUCKET = "private-user-images";
const PRIVATE_IMAGE_SCHEME = "private-image:";

export interface PrivateImageReference {
  bucket: typeof PRIVATE_USER_IMAGES_BUCKET;
  ownerId: string;
  path: string;
}

export function makePrivateImageReference(path: string): string {
  const safePath = path.split("/").map((part) => encodeURIComponent(part)).join("/");
  return `private-image://${PRIVATE_USER_IMAGES_BUCKET}/${safePath}`;
}

export function parsePrivateImageReference(value: string): PrivateImageReference | null {
  if (!value.startsWith(PRIVATE_IMAGE_SCHEME)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== PRIVATE_IMAGE_SCHEME || url.hostname !== PRIVATE_USER_IMAGES_BUCKET || url.search || url.hash) {
      return null;
    }
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    if (parts.length < 2 || parts.some((part) => !part || part === "." || part === ".." || part.includes("/") || part.includes("\\"))) {
      return null;
    }
    return { bucket: PRIVATE_USER_IMAGES_BUCKET, ownerId: parts[0], path: parts.join("/") };
  } catch {
    return null;
  }
}

export function isPrivateImageReference(value: string): boolean {
  return parsePrivateImageReference(value) !== null;
}

export function isTeamSharedImageReference(value: string): boolean {
  const reference = parsePrivateImageReference(value);
  const parts = reference?.path.split("/");
  return !!parts && parts[1] === "team" && /^[0-9a-f-]{36}$/i.test(parts[2] ?? "");
}

export async function resolvePrivateImageReference(value: string, expiresIn = 900): Promise<string> {
  const reference = parsePrivateImageReference(value);
  if (!reference) return value;
  if (!supabase) throw new Error("Image storage is unavailable");
  const { data, error } = await supabase.storage
    .from(reference.bucket)
    .createSignedUrl(reference.path, expiresIn);
  if (error || !data?.signedUrl) throw new Error(error?.message || "Could not open this private image");
  return data.signedUrl;
}

export function useResolvedImageUrls(values: Array<string | undefined | null> | undefined): Record<string, string> {
  const serialized = JSON.stringify((values ?? []).filter((value): value is string => typeof value === "string" && !!value));
  const urls = useMemo(() => JSON.parse(serialized) as string[], [serialized]);
  const [resolved, setResolved] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    const privateUrls = urls.filter(isPrivateImageReference);
    if (!privateUrls.length) {
      setResolved({});
      return () => { active = false; };
    }
    void Promise.all(privateUrls.map(async (value) => {
      try {
        return [value, await resolvePrivateImageReference(value)] as const;
      } catch {
        return [value, ""] as const;
      }
    })).then((entries) => {
      if (active) setResolved(Object.fromEntries(entries));
    });
    return () => { active = false; };
  }, [urls]);

  return resolved;
}

export async function sharePrivateImage(value: string): Promise<string> {
  const reference = parsePrivateImageReference(value);
  if (!reference || !supabase) throw new Error("This image cannot be shared");
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error("Sign in before sharing this image");
  const teamShare = isTeamSharedImageReference(value);
  if (user.id !== reference.ownerId && !teamShare) throw new Error("You can only share images you own or can access in a shared chat");

  const { data: file, error: downloadError } = await supabase.storage
    .from(reference.bucket)
    .download(reference.path);
  if (downloadError || !file) throw new Error(downloadError?.message || "Could not read this private image");

  const extension = reference.path.split("/").pop()?.split(".").pop()?.replace(/[^a-z0-9]/gi, "").toLowerCase() || "png";
  const publicPath = `${user.id}/shared-${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from("avatars").upload(publicPath, file, {
    contentType: file.type || "image/png",
    upsert: false,
  });
  if (uploadError) throw new Error(uploadError.message || "Could not create a public share");
  const { data } = supabase.storage.from("avatars").getPublicUrl(publicPath);
  if (!data?.publicUrl) throw new Error("Could not create a public share link");
  return data.publicUrl;
}
