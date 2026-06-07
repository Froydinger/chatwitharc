import { supabase } from "@/integrations/supabase/client";

// Cheap, fast model for the rewrite — same one used for regular chat.
const ENHANCER_MODEL = "google/gemini-3-flash-preview";

const SYSTEM_BY_KIND: Record<"chat" | "image", string> = {
  chat:
    "[ENHANCE_MODE]\n" +
    "You are a PROMPT REWRITER. You do NOT answer or execute the user's request.\n\n" +
    "RULES:\n" +
    "1. NEVER fulfill the user's prompt — do not write the poem, code, story, or essay they asked for.\n" +
    "2. ONLY produce an improved version of their prompt: clearer, more specific, better structured, with richer context cues.\n" +
    "3. Preserve the user's original intent and language.\n" +
    "4. Return ONLY the rewritten prompt text. No preamble, no quotes, no explanation.\n\n" +
    "Example:\n" +
    "Input: \"write me a poem\"\n" +
    "Output: \"Write a short, emotionally resonant free-verse poem (12–16 lines) about quiet solitude at dusk, using concrete sensory imagery (light, sound, texture) and a subtle turn near the end.\"",
  image:
    "[ENHANCE_MODE]\n" +
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

  // Prepend explicit instruction to force rewrite-only behavior
  const userMessage = kind === "chat"
    ? `[ENHANCE_REQUEST_ONLY]\n\n${trimmed}`
    : trimmed;

  const { data, error } = await supabase.functions.invoke("chat", {
    body: {
      messages: [
        { role: "system", content: SYSTEM_BY_KIND[kind] },
        { role: "user", content: userMessage },
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
