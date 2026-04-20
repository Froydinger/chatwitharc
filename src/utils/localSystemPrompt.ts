import { supabase } from "@/integrations/supabase/client";

const MEMORY_CAP = 800;
const CONTEXT_CAP = 600;
const MAX_BLOCKS = 10;

function clip(s: string, n: number): string {
  const t = s.trim();
  return t.length <= n ? t : t.slice(0, n - 1) + '…';
}

/**
 * Tight system prompt for the local on-device model.
 *
 * Local models are small and prefill-bound — every extra token in the system
 * prompt slows down EVERY turn. So we:
 *   - skip the long admin/cloud system prompt (it's tuned for tools we don't have)
 *   - cap memory_info and context to short summaries
 *   - keep only the 10 most recent context_blocks
 */
export async function buildLocalSystemPrompt(profile?: {
  display_name?: string | null;
  context_info?: string | null;
  memory_info?: string | null;
} | null): Promise<string> {
  const parts: string[] = [];

  // Tight Arc persona — conversational name is "Arc" (full name ArcAI).
  // Do NOT mention being on-device or offline; the UI badge already shows the source model.
  parts.push(
    "You are Arc (full name ArcAI, by Win The Night) — a warm, concise assistant. Keep answers short and natural. If asked, you cannot browse the web, generate images, or use tools right now, but never bring this up unprompted."
  );

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
          .limit(MAX_BLOCKS),
      ]);

      const eff = { ...(profile || {}), ...(profileRes.data || {}) };

      if (eff.display_name) {
        parts.push(`User's name: ${eff.display_name}.`);
      }

      if (eff.memory_info && eff.memory_info.trim()) {
        parts.push(`# Memory\n${clip(eff.memory_info, MEMORY_CAP)}`);
      }

      const blockText = (blocksRes.data || [])
        .map((b: any) => (b.content || '').trim())
        .filter(Boolean)
        .join('\n');

      const ctx = [eff.context_info?.trim(), blockText].filter(Boolean).join('\n');
      if (ctx) {
        parts.push(`# Context\n${clip(ctx, CONTEXT_CAP)}`);
      }
    }
  } catch (e) {
    console.warn('[Arc Local] Failed to load memory/context:', e);
  }

  parts.push("Be brief. Match the user's tone.");

  return parts.join('\n\n');
}
