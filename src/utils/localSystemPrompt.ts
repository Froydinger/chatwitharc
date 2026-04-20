import { supabase } from "@/integrations/supabase/client";

/**
 * Builds a rich system prompt for the local Gemma model that mirrors the
 * cloud `chat` edge function as closely as possible: identity, user profile,
 * memory_info, context_info, context_blocks, and admin system prompt.
 *
 * Local models can't call tools (search, memory writes, etc.), so we strip
 * tool instructions and keep this focused on persona + user context.
 */
export async function buildLocalSystemPrompt(profile?: {
  display_name?: string | null;
  context_info?: string | null;
  memory_info?: string | null;
} | null): Promise<string> {
  const parts: string[] = [];

  // 1. Try admin system prompt (primary identity)
  let adminPrompt = '';
  try {
    const { data } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'system_prompt')
      .maybeSingle();
    adminPrompt = (data?.value || '').trim();
  } catch { /* ignore */ }

  if (adminPrompt) {
    parts.push(adminPrompt);
  } else {
    parts.push(
      "You are ArcAI by Win The Night — a warm, concise, helpful AI assistant. " +
      "Keep responses short and natural. You are currently running fully on-device (Arc Local) so you cannot search the web, generate images, or access tools."
    );
  }

  // 2. Pull fresh profile + context_blocks from the DB
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
          .limit(50),
      ]);

      const eff = { ...(profile || {}), ...(profileRes.data || {}) };

      if (eff.display_name) {
        parts.push(`The user's name is ${eff.display_name}. Address them naturally when appropriate.`);
      }

      if (eff.memory_info && eff.memory_info.trim()) {
        parts.push(`# What you remember about the user (Arc's Brain)\n${eff.memory_info.trim()}`);
      }

      const blockText = (blocksRes.data || [])
        .map((b: any) => (b.content || '').trim())
        .filter(Boolean)
        .join('\n');

      const ctx = [eff.context_info?.trim(), blockText].filter(Boolean).join('\n');
      if (ctx) {
        parts.push(`# User context\n${ctx}`);
      }
    }
  } catch (e) {
    console.warn('[Arc Local] Failed to load memory/context for system prompt:', e);
  }

  // 3. Brevity reinforcement (matches cloud behavior)
  parts.push(
    "IMPORTANT: Keep responses concise and conversational. Avoid long preambles. Match the user's tone."
  );

  return parts.join('\n\n');
}
