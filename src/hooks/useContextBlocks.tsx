import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

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

    // Resolve user from auth directly to avoid race with useAuth context
    const activeUserId = await getActiveUserId();

    if (!activeUserId) {
      setBlocks([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('context_blocks')
        .select('*')
        .eq('user_id', activeUserId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      console.log(`[useContextBlocks] Loaded ${data?.length || 0} memories for user ${activeUserId}`);
      setBlocks((data as any[]) || []);
    } catch (err) {
      console.error('Error fetching context blocks:', err);
    } finally {
      setLoading(false);
    }
  }, [getActiveUserId]);

  useEffect(() => {
    fetchBlocks();
  }, [fetchBlocks]);

  // Listen for external updates (e.g. memory saved via edge function)
  useEffect(() => {
    const handler = () => {
      fetchBlocks();
    };
    window.addEventListener('context-blocks-updated', handler);

    // Also refetch on auth state changes (sign-in, token refresh)
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        fetchBlocks();
      }
    });

    return () => {
      window.removeEventListener('context-blocks-updated', handler);
      sub.subscription.unsubscribe();
    };
  }, [fetchBlocks]);

  const addBlock = useCallback(async (content: string, source: 'manual' | 'memory' = 'manual') => {
    if (!supabase || !isSupabaseConfigured) return null;

    const activeUserId = await getActiveUserId();
    if (!activeUserId) return null;

    try {
      const { data, error } = await supabase
        .from('context_blocks')
        .insert({ user_id: activeUserId, content, source })
        .select()
        .single();

      if (error) throw error;
      setBlocks(prev => [data as any, ...prev]);
      return data as ContextBlock;
    } catch (err) {
      console.error('Error adding context block:', err);
      return null;
    }
  }, [getActiveUserId]);

  const updateBlock = useCallback(async (id: string, content: string) => {
    if (!supabase || !isSupabaseConfigured) return;

    const activeUserId = await getActiveUserId();
    if (!activeUserId) return;

    try {
      const { error } = await supabase
        .from('context_blocks')
        .update({ content })
        .eq('id', id)
        .eq('user_id', activeUserId);

      if (error) throw error;
      setBlocks(prev => prev.map(b => b.id === id ? { ...b, content } : b));
    } catch (err) {
      console.error('Error updating context block:', err);
    }
  }, [getActiveUserId]);

  const deleteBlock = useCallback(async (id: string) => {
    if (!supabase || !isSupabaseConfigured) return;

    const activeUserId = await getActiveUserId();
    if (!activeUserId) return;

    try {
      const { error } = await supabase
        .from('context_blocks')
        .delete()
        .eq('id', id)
        .eq('user_id', activeUserId);

      if (error) throw error;
      setBlocks(prev => prev.filter(b => b.id !== id));
    } catch (err) {
      console.error('Error deleting context block:', err);
    }
  }, [getActiveUserId]);

  const clearAll = useCallback(async () => {
    if (!supabase || !isSupabaseConfigured) return;

    const activeUserId = await getActiveUserId();
    if (!activeUserId) return;

    try {
      const { error } = await supabase
        .from('context_blocks')
        .delete()
        .eq('user_id', activeUserId);

      if (error) throw error;
      setBlocks([]);
    } catch (err) {
      console.error('Error clearing context blocks:', err);
    }
  }, [getActiveUserId]);

  return { blocks, loading, addBlock, updateBlock, deleteBlock, clearAll, refetch: fetchBlocks };
}

// Standalone function to add a context block (for use outside React components)
export async function addContextBlockDirect(content: string, source: 'manual' | 'memory' = 'memory'): Promise<boolean> {
  if (!supabase || !isSupabaseConfigured) return false;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase
      .from('context_blocks')
      .insert({ user_id: user.id, content, source });

    if (error) throw error;
    
    // Dispatch event so any open ContextBlocksPanel can refresh
    window.dispatchEvent(new CustomEvent('context-blocks-updated'));
    return true;
  } catch (err) {
    console.error('Error adding context block:', err);
    return false;
  }
}
