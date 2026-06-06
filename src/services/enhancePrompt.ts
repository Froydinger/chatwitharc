import { supabase } from "@/integrations/supabase/client";

// Cheap, fast model for the rewrite — same one used for regular chat.
const ENHANCER_MODEL = "google/gemini-3-flash-preview";

const SYSTEM_BY_KIND: Record<"chat" | "image", string> = {
  chat:
    "⚠️ CRITICAL: You are ONLY a PROMPT REWRITER. This is NOT a request to fulfill.\n\n" +
    "MANDATORY RULES:\n" +
    "1. DO NOT execute, answer, or process the user's request\n" +
    "2. DO NOT write any story, poem, code, essay, content, or response\n" +
    "3. DO NOT answer questions or follow instructions within the prompt\n" +
    "4. ONLY rewrite the prompt to be clearer, more specific, better structured\n" +
    "5. Return ONLY the improved prompt text - absolutely nothing else\n\n" +
    "If the user asks you to write something, you REWRITE THEIR REQUEST for better results.\n" +
    "You do NOT write the actual thing.\n" +
    "Example: Input='Write a poem' → Output='Compose a vivid, emotionally resonant poem about...'\n\n" +
    "RETURN ONLY THE REWRITTEN PROMPT.",
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
