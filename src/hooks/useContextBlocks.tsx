import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { applyMemorySummary, getMemorySummary } from '@/lib/memorySummary';

// Kept for compatibility with existing panels and dashboard code. There is now
// one canonical living-memory document instead of a list of memory slots.
export interface ContextBlock {
  id: string;
  content: string;
  source: 'manual' | 'memory';
  created_at: string;
  updated_at: string;
}

export function useContextBlocks() {
  const { user } = useAuth();
  const [blocks, setBlocks] = useState<ContextBlock[]>([]);
  const [loading, setLoading] = useState(true);

  const getActiveUserId = useCallback(async () => {
    if (!supabase || !isSupabaseConfigured) return null;
    const { data: { user: authUser } } = await supabase.auth.getUser();
    return user?.id || authUser?.id || null;
  }, [user]);

  const fetchBlocks = useCallback(async () => {
    if (!supabase || !isSupabaseConfigured) {
      setBlocks([]);
      setLoading(false);
      return;
    }

    const activeUserId = await getActiveUserId();
    if (!activeUserId) {
      setBlocks([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await getMemorySummary();
      const now = new Date().toISOString();
      setBlocks(data.summary.trim() ? [{
        id: `memory-summary:${activeUserId}`,
        content: data.summary,
        source: 'memory',
        created_at: now,
        updated_at: now,
      }] : []);
    } catch (err) {
      console.error('Error fetching living memory summary:', err);
    } finally {
      setLoading(false);
    }
  }, [getActiveUserId]);

  useEffect(() => {
    fetchBlocks();
  }, [fetchBlocks]);

  useEffect(() => {
    const handler = () => { fetchBlocks(); };
    window.addEventListener('context-blocks-updated', handler);
    window.addEventListener('memory-summary-updated', handler);

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        fetchBlocks();
      }
    });

    return () => {
      window.removeEventListener('context-blocks-updated', handler);
      window.removeEventListener('memory-summary-updated', handler);
      sub.subscription.unsubscribe();
    };
  }, [fetchBlocks]);

  const addBlock = useCallback(async (content: string, source: 'manual' | 'memory' = 'manual') => {
    if (!supabase || !isSupabaseConfigured || !content.trim()) return null;
    const activeUserId = await getActiveUserId();
    if (!activeUserId) return null;

    try {
      const data = await applyMemorySummary('save', content.trim());
      const now = new Date().toISOString();
      const block: ContextBlock = {
        id: `memory-summary:${activeUserId}`,
        content: data.summary,
        source,
        created_at: now,
        updated_at: now,
      };
      setBlocks(data.summary.trim() ? [block] : []);
      window.dispatchEvent(new CustomEvent('memory-summary-updated'));
      return block;
    } catch (err) {
      console.error('Error adding to living memory:', err);
      return null;
    }
  }, [getActiveUserId]);

  const updateBlock = useCallback(async (id: string, content: string) => {
    if (!supabase || !isSupabaseConfigured) return;
    const activeUserId = await getActiveUserId();
    if (!activeUserId) return;

    try {
      const data = await applyMemorySummary('replace_summary', undefined, content.trim());
      const now = new Date().toISOString();
      setBlocks(data.summary.trim() ? [{ id, content: data.summary, source: 'memory', created_at: now, updated_at: now }] : []);
      window.dispatchEvent(new CustomEvent('memory-summary-updated'));
    } catch (err) {
      console.error('Error updating living memory:', err);
    }
  }, [getActiveUserId]);

  const deleteBlock = useCallback(async (_id: string) => {
    if (!supabase || !isSupabaseConfigured) return;
    const activeUserId = await getActiveUserId();
    if (!activeUserId) return;
    try {
      await applyMemorySummary('replace_summary', undefined, '');
      setBlocks([]);
      window.dispatchEvent(new CustomEvent('memory-summary-updated'));
    } catch (err) {
      console.error('Error deleting living memory:', err);
    }
  }, [getActiveUserId]);

  const clearAll = useCallback(async () => {
    if (!supabase || !isSupabaseConfigured) return;
    const activeUserId = await getActiveUserId();
    if (!activeUserId) return;
    try {
      await applyMemorySummary('replace_summary', undefined, '');
      setBlocks([]);
      window.dispatchEvent(new CustomEvent('memory-summary-updated'));
    } catch (err) {
      console.error('Error clearing living memory:', err);
    }
  }, [getActiveUserId]);

  return { blocks, loading, addBlock, updateBlock, deleteBlock, clearAll, refetch: fetchBlocks };
}

export async function addContextBlockDirect(content: string, _source: 'manual' | 'memory' = 'memory'): Promise<boolean> {
  if (!supabase || !isSupabaseConfigured) return false;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    await applyMemorySummary('save', content.trim());
    window.dispatchEvent(new CustomEvent('context-blocks-updated'));
    window.dispatchEvent(new CustomEvent('memory-summary-updated'));
    return true;
  } catch (err) {
    console.error('Error adding to living memory:', err);
    return false;
  }
}
