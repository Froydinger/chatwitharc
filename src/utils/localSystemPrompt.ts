import { supabase } from "@/integrations/supabase/client";
import { getLocalToolInstructions } from "@/utils/localToolProtocol";
import { getActiveLocalModelId, IOS_LITE_MODEL } from "@/services/localAI";
import { useCorporateModeStore } from "@/store/useCorporateModeStore";

/**
 * System prompt builder for the on-device (local) model.
 *
 * Goal: feed the local model the SAME identity & guidance that cloud Arc gets,
 * so behavior, tone, and self-knowledge are consistent across every Arc surface.
 *
 * Differences vs cloud:
 *   - We strip the tool-calling section (web_search, save_memory, generate_file,
 *     update_canvas, update_code, /build) — the local model has no tools, and
 *     mentioning them only causes hallucinated tool talk.
 *   - We frame user memory clearly as "about the user, not you" so small models
 *     don't roleplay the user's beliefs as their own.
 *   - History is capped upstream (last 8 messages) to keep prefill fast.
 */

// Strip the cloud-only tool/behavioral block so the local model never advertises
// abilities it doesn't have. We cut from the BEHAVIORAL GUIDELINES marker (or the
// /build rules marker, whichever appears first) up to the next "===" section or
// end-of-string.
function stripToolGuidance(prompt: string): string {
  if (!prompt) return prompt;
  let out = prompt;

  // Remove "--- BEHAVIORAL GUIDELINES ---" block (everything until the next
  // "===" header or end).
  out = out.replace(/\n*---\s*BEHAVIORAL GUIDELINES\s*---[\s\S]*?(?=\n=== |\n*$)/i, '');

  // Remove "/build COMMAND RULES" block if it survived above.
  out = out.replace(/\n*===\s*\/build COMMAND RULES[\s\S]*?(?=\n=== |\n*$)/i, '');

  // Remove "CODE OUTPUT RULES" block — local model isn't producing canvas code.
  out = out.replace(/\n*===\s*CODE OUTPUT RULES[\s\S]*?(?=\n=== |\n*$)/i, '');

  return out.trim();
}

export async function buildLocalSystemPrompt(profile?: {
  display_name?: string | null;
  context_info?: string | null;
  memory_info?: string | null;
} | null): Promise<string> {
  const parts: string[] = [];

  // 0. CRITICAL safety block — surfaced to the very top so small on-device
  // models reliably attend to it. Cloud Arc gets the same content lower in
  // the prompt; here we duplicate it up top because 1B-class models drop
  // long-tail context.
  parts.push(
    `# ⚠️ CRITICAL SAFETY (ALWAYS APPLIES)
If the user shows ANY sign of crisis, suicide, self-harm, or severe distress:
1. Ground them gently first — do not rush to fix.
2. Tell them they can call or text 988 (US Suicide & Crisis Lifeline) for immediate help.
3. Share this resource page for hotlines and organizations: https://winthenight.productions/crisis-resources
Never minimize, never lecture, never suggest 911 unless there is an immediate physical emergency. Keep it calm.`
  );

  // 1. Pull admin system prompt + global context (same source as cloud chat).
  let adminPrompt = '';
  let globalContext = '';
  try {
    const { data: settingsData } = await supabase
      .from('admin_settings')
      .select('key, value')
      .in('key', ['system_prompt', 'global_context']);
    const settings = (settingsData || []).reduce((acc, s) => {
      acc[s.key] = s.value;
      return acc;
    }, {} as Record<string, string>);
    adminPrompt = settings.system_prompt || '';
    globalContext = settings.global_context || '';
  } catch (e) {
    console.warn('[Arc Local] Failed to load admin prompt:', e);
  }

  if (adminPrompt) {
    parts.push(stripToolGuidance(adminPrompt));
  } else {
    // Fallback persona if admin row is unavailable.
    parts.push(
      "You are Arc (full name ArcAI, by Win The Night) — a warm, concise assistant. Your core principles are: Ask, Reflect, Create. Keep answers short and natural."
    );
  }

  // 2. Local capabilities — replace cloud's tool-call section with our text-tag protocol.
  const isLite = getActiveLocalModelId() === IOS_LITE_MODEL;
  parts.push(getLocalToolInstructions());
  parts.push(
    isLite
      ? "You are running on-device on iPhone (Llama 3.2 1B). You CAN save memories about the user using the tag above, but you cannot browse the web, search past chats, generate images, or write to a canvas. Keep answers concise. Never mention these limits unless directly asked."
      : "You are running on-device, so you cannot browse the web, generate images, or write to a canvas — but you CAN recall past chats and save memories using the tags above. Never mention these limits unless directly asked."
  );

  // 3. Inject current date/time (cloud does this too).
  const nowString = new Date().toUTCString();
  parts.push(`Current date and time: ${nowString}`);

  // 4. User identity / memory / context — clearly labelled as ABOUT THE USER.
  const corp = useCorporateModeStore.getState();

  if (corp.enabled) {
    // === Corporate Mode: NEVER touch the network here. ===
    // Use only the persisted snapshot (if the user opted in).
    if (corp.memoriesEnabled === true && corp.memorySnapshot) {
      const snap = corp.memorySnapshot;
      const userBits: string[] = [];
      if (snap.display_name) userBits.push(`Name: ${snap.display_name}`);
      if (snap.context_info?.trim()) userBits.push(`Context: ${snap.context_info.trim()}`);
      if (userBits.length) {
        parts.push(`# About the user (these facts describe the USER, not you)\n${userBits.join('\n')}`);
      }
      if (snap.memory_info?.trim()) {
        parts.push(
          `# 📝 Memories about the user (NOT your beliefs)\nThese are facts, beliefs, and preferences belonging to the user. Reference them only when relevant — never claim them as your own.\n\n${snap.memory_info.trim()}`
        );
      }
      const blockText = (snap.context_blocks || []).join('\n').trim();
      if (blockText) {
        parts.push(`# Additional context blocks about the user\n${blockText}`);
      }
    }
    // If memoriesEnabled is false or null, omit the entire memory section.
  } else {
    // Normal (non-corporate) mode: pull live from the cloud.
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const [profileRes, blocksRes] = await Promise.all([
          supabase
            .from('profiles')
            .select('display_name, context_info, memory_info')
            .eq('user_id', user.id)
            .maybeSingle(),
          supabase
            .from('context_blocks')
            .select('content')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(20),
        ]);

        const eff = { ...(profile || {}), ...(profileRes.data || {}) };

        const userBits: string[] = [];
        if (eff.display_name) userBits.push(`Name: ${eff.display_name}`);
        if (eff.context_info?.trim()) userBits.push(`Context: ${eff.context_info.trim()}`);
        if (userBits.length) {
          parts.push(`# About the user (these facts describe the USER, not you)\n${userBits.join('\n')}`);
        }

        if (eff.memory_info && eff.memory_info.trim()) {
          parts.push(
            `# 📝 Memories about the user (NOT your beliefs)\nThese are facts, beliefs, and preferences belonging to the user. Reference them only when relevant — never claim them as your own.\n\n${eff.memory_info.trim()}`
          );
        }

        const blockText = (blocksRes.data || [])
          .map((b: any) => (b.content || '').trim())
          .filter(Boolean)
          .join('\n');
        if (blockText) {
          parts.push(`# Additional context blocks about the user\n${blockText}`);
        }
      }
    } catch (e) {
      console.warn('[Arc Local] Failed to load user memory/context:', e);
    }
  }

  // 5. Global admin context (e.g. seasonal notes, announcements).
  if (globalContext.trim()) {
    parts.push(`# Global context\n${globalContext.trim()}`);
  }

  // 6. Final brevity nudge.
  parts.push(
    "Be brief and natural. Match the user's tone. Never confuse the user's memories or beliefs with your own identity."
  );

  return parts.join('\n\n');
}
