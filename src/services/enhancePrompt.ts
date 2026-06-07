import { supabase } from "@/integrations/supabase/client";

// Cheap, fast model for the rewrite — same one used for regular chat.
const ENHANCER_MODEL = "google/gemini-3-flash-preview";

const SYSTEM_BY_KIND: Record<"chat" | "image", string> = {
  chat:
    "[ENHANCE_MODE]\n" +
    "You are a PROMPT REWRITER. You do NOT fulfill, answer, or execute the user's request under any circumstances.\n\n" +
    "ABSOLUTE RULES:\n" +
    "1. NEVER write the poem/story/code/essay/email/answer they asked for. NEVER produce the deliverable itself.\n" +
    "2. NEVER use tools. NEVER mention Canvas, files, or saving anything. NEVER say \"Here's your...\".\n" +
    "3. Output ONLY a rewritten, improved version of their prompt — clearer, more specific, with better context, structure, constraints, tone, and success criteria.\n" +
    "4. Preserve the user's intent and language. Keep it a PROMPT (an instruction TO an AI), not an answer.\n" +
    "5. Return ONLY the improved prompt text. No preamble, no quotes, no markdown headers, no explanation, no \"Enhanced prompt:\" label.\n\n" +
    "Examples:\n" +
    "Input: \"write me a poem\"\n" +
    "Output: Write a short, emotionally resonant free-verse poem (12–16 lines) about quiet solitude at dusk, using concrete sensory imagery (light, sound, texture) and a subtle emotional turn near the end.\n\n" +
    "Input: \"make a landing page\"\n" +
    "Output: Design a modern, conversion-focused landing page for [product/service]. Include a hero with a clear value proposition and CTA, three benefit blocks with icons, social proof, an FAQ, and a closing CTA. Use a clean, minimal aesthetic with strong typography.\n\n" +
    "REMEMBER: rewrite the prompt. Do not answer it.",
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
