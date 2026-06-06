import { supabase } from "@/integrations/supabase/client";

// Cheap, fast model for the rewrite — same one used for regular chat.
const ENHANCER_MODEL = "google/gemini-3-flash-preview";

const SYSTEM_BY_KIND: Record<"chat" | "image", string> = {
  chat:
    "You are a prompt enhancer. Rewrite the user's message into a clearer, more " +
    "specific, well-structured prompt that will get a better answer from an AI " +
    "assistant. Preserve the user's original intent, language, and any concrete " +
    "details. Do not answer the prompt or add commentary — return ONLY the improved " +
    "prompt text, with no quotes or preamble.",
  image:
    "You are an image-prompt enhancer. Rewrite the user's request into a vivid, " +
    "detailed image-generation prompt: subject, style, lighting, composition, mood, " +
    "and quality cues. Keep the user's original intent. Return ONLY the improved " +
    "prompt text, with no quotes or preamble.",
};

/**
 * Sends `text` to the existing `chat` edge function with a rewrite system prompt
 * and returns an improved version. Throws on failure so callers can toast.
 */
export async function enhancePrompt(text: string, kind: "chat" | "image" = "chat"): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  if (!supabase) throw new Error("Not connected");

  const { data, error } = await supabase.functions.invoke("chat", {
    body: {
      messages: [
        { role: "system", content: SYSTEM_BY_KIND[kind] },
        { role: "user", content: trimmed },
      ],
      model: ENHANCER_MODEL,
      clientDateTime: new Date().toString(),
      clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      clientTimezoneOffsetMinutes: new Date().getTimezoneOffset(),
    },
  });

  if (error) throw new Error(error.message || "Enhancement failed");
  if (data?.error) throw new Error(data.error);

  const improved = data?.choices?.[0]?.message?.content?.trim();
  if (!improved) throw new Error("No suggestion returned");
  return improved;
}
