import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import type { CorporateMemorySnapshot } from '@/store/useCorporateModeStore';

/**
 * One-shot fetch of the user's memories/context for Corporate Mode.
 *
 * This is the ONLY moment Corporate Mode touches the network for memory data —
 * once snapshotted, all future reads are served locally from the persisted
 * Zustand store.
 */
export async function fetchCorporateMemorySnapshot(): Promise<CorporateMemorySnapshot | null> {
  if (!supabase || !isSupabaseConfigured) return null;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

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

    const profile = profileRes.data || {};
    const blocks = (blocksRes.data || [])
      .map((b: any) => (b.content || '').trim())
      .filter(Boolean);

    return {
      display_name: profile.display_name ?? null,
      context_info: profile.context_info ?? null,
      memory_info: profile.memory_info ?? null,
      context_blocks: blocks,
      cached_at: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[Corporate Mode] Failed to snapshot memories:', err);
    return null;
  }
}
