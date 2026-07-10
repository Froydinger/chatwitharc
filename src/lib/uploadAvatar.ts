import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
}

export async function uploadAvatar(file: File): Promise<string> {
  if (!supabase || !isSupabaseConfigured) {
    throw new Error("Supabase is not configured");
  }

  const base64 = await fileToBase64(file);
  const { data, error } = await supabase.functions.invoke("upload-avatar", {
    body: {
      base64,
      contentType: file.type,
      fileName: file.name,
    },
  });

  if (error) throw error;

  const avatarUrl = (data as { avatarUrl?: string } | null)?.avatarUrl;
  if (!avatarUrl) throw new Error("Avatar upload did not return a URL");

  return avatarUrl;
}
