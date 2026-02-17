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

  const fetchBlocks = useCallback(async () => {
    if (!user || !supabase || !isSupabaseConfigured) {
      setBlocks([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('context_blocks')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBlocks((data as any[]) || []);
    } catch (err) {
      console.error('Error fetching context blocks:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchBlocks();
  }, [fetchBlocks]);

  // Listen for external updates (e.g. memory saved via edge function)
  useEffect(() => {
    const handler = () => {
      fetchBlocks();
    };
    window.addEventListener('context-blocks-updated', handler);
    return () => window.removeEventListener('context-blocks-updated', handler);
  }, [fetchBlocks]);

  const addBlock = useCallback(async (content: string, source: 'manual' | 'memory' = 'manual') => {
    if (!user || !supabase || !isSupabaseConfigured) return null;

    try {
      const { data, error } = await supabase
        .from('context_blocks')
        .insert({ user_id: user.id, content, source })
        .select()
        .single();

      if (error) throw error;
      setBlocks(prev => [data as any, ...prev]);
      return data as ContextBlock;
    } catch (err) {
      console.error('Error adding context block:', err);
      return null;
    }
  }, [user]);

  const updateBlock = useCallback(async (id: string, content: string) => {
    if (!user || !supabase || !isSupabaseConfigured) return;

    try {
      const { error } = await supabase
        .from('context_blocks')
        .update({ content })
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;
      setBlocks(prev => prev.map(b => b.id === id ? { ...b, content } : b));
    } catch (err) {
      console.error('Error updating context block:', err);
    }
  }, [user]);

  const deleteBlock = useCallback(async (id: string) => {
    if (!user || !supabase || !isSupabaseConfigured) return;

    try {
      const { error } = await supabase
        .from('context_blocks')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;
      setBlocks(prev => prev.filter(b => b.id !== id));
    } catch (err) {
      console.error('Error deleting context block:', err);
    }
  }, [user]);

  const clearAll = useCallback(async () => {
    if (!user || !supabase || !isSupabaseConfigured) return;

    try {
      const { error } = await supabase
        .from('context_blocks')
        .delete()
        .eq('user_id', user.id);

      if (error) throw error;
      setBlocks([]);
    } catch (err) {
      console.error('Error clearing context blocks:', err);
    }
  }, [user]);

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
