import { getBYOKKey, type BYOKProvider } from "@/store/useBYOKStore";
import { useModelStore } from "@/store/useModelStore";

// Direct, client-side chat completions using the user's own API key (BYOK).
// Plain text only — image/voice/canvas/code stay on ArcAI's normal infra.

// Real provider model ids (the app's internal MODEL_MAP uses gateway aliases,
// which don't apply when calling the providers directly). Widely-available
// low-cost defaults.
export const BYOK_OPENAI_MODEL = "gpt-4o-mini";
export const BYOK_GEMINI_MODEL = "gemini-2.0-flash";

export interface BYOKProfile {
  display_name?: string | null;
  context_info?: string | null;
  memory_info?: string | null;
}

interface ChatMsg {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Returns the active BYOK provider+key for the currently-selected model family,
 * or null if the user hasn't supplied a key for it.
 */
export function getActiveBYOK(): { provider: BYOKProvider; key: string } | null {
  const family = useModelStore.getState().modelFamily; // 'gemini' | 'gpt'
  const provider: BYOKProvider = family === "gpt" ? "openai" : "gemini";
  const key = getBYOKKey(provider);
  return key ? { provider, key } : null;
}

function buildSystemPrompt(profile?: BYOKProfile): string {
  const parts = ["You are ArcAI, a helpful, concise assistant."];
  if (profile?.display_name) parts.push(`The user's name is ${profile.display_name}.`);
  if (profile?.context_info) parts.push(`Context about the user:\n${profile.context_info}`);
  if (profile?.memory_info) parts.push(`Remembered details:\n${profile.memory_info}`);
  return parts.join("\n\n");
}

async function callOpenAI(key: string, system: string, messages: ChatMsg[]): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: BYOK_OPENAI_MODEL,
      messages: [{ role: "system", content: system }, ...messages],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenAI ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.trim() || "";
}

async function callGemini(key: string, system: string, messages: ChatMsg[]): Promise<string> {
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${BYOK_GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
      }),
    },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gemini ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  return (
    data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("").trim() || ""
  );
}

/**
 * Sends a plain-text chat turn directly to the user's own provider. Throws on
 * failure so the caller can fall back to ArcAI's normal infrastructure.
 */
export async function byokSendChat(
  messages: ChatMsg[],
  opts: { provider: BYOKProvider; key: string; profile?: BYOKProfile },
): Promise<string> {
  const system = buildSystemPrompt(opts.profile);
  const content =
    opts.provider === "openai"
      ? await callOpenAI(opts.key, system, messages)
      : await callGemini(opts.key, system, messages);
  if (!content) throw new Error("Empty response from provider");
  return content;
}
