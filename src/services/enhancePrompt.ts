import { supabase } from "@/integrations/supabase/client";

/**
 * Rewrites the given text into a clearer, more effective prompt via the
 * dedicated `enhance-prompt` edge function. Never executes the prompt.
 */
export async function enhancePrompt(text: string, kind: "chat" | "image" = "chat"): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  if (!supabase) throw new Error("Not connected");

  const { data, error } = await supabase.functions.invoke("enhance-prompt", {
    body: { text: trimmed, kind },
  });

  if (error) throw new Error(error.message || "Enhancement failed");
  if (data?.error) throw new Error(data.error);

  const improved = (data?.improved as string | undefined)?.trim();
  if (!improved) throw new Error("No suggestion returned");
  return improved;
}
