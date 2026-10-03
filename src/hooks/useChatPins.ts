import { useEffect } from 'react';
import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const usePinState = create<{ owner: string | null; ids: string[]; loaded: boolean }>(() => ({ owner: null, ids: [], loaded: false }));
let pendingOwner: string | null = null;
async function refreshPins(owner: string) {
  const { data, error } = await supabase.from('chat_sessions').select('id,is_pinned').eq('user_id', owner).eq('is_pinned', true);
  if (error) throw error;
  if (usePinState.getState().owner === owner) usePinState.setState({ ids: (data ?? []).map(row => row.id), loaded: true });
}
export function useChatPins() {
  const { user, isAnonymous } = useAuth();
  const owner = user && !isAnonymous ? user.id : null;
  const state = usePinState();
  useEffect(() => {
    if (usePinState.getState().owner !== owner) usePinState.setState({ owner, ids: [], loaded: false });
    if (!owner || usePinState.getState().loaded || pendingOwner === owner) return;
    pendingOwner = owner;
    void (async () => {
      try {
        await refreshPins(owner);
      } catch { toast.error('Could not load pinned chats.'); }
      finally { if (pendingOwner === owner) pendingOwner = null; }
    })();
  }, [owner]);
  const ids = state.owner === owner ? state.ids : [];
  const setPinned = async (id: string, pinned: boolean) => {
    if (!owner) throw new Error('Sign in to pin chats.');
    const { data, error } = await supabase.from('chat_sessions').update({ is_pinned: pinned }).eq('id', id).eq('user_id', owner).select('id').single();
    if (error || !data) throw new Error('Could not save the pin. Please try again.');
    if (usePinState.getState().owner === owner) usePinState.setState(current => ({ ids: pinned ? [...new Set([...current.ids, id])] : current.ids.filter(item => item !== id) }));
  };
  return { pinnedIds: ids, setPinned, refreshPins: async () => { if (!owner) throw new Error('Sign in to sync chats.'); await refreshPins(owner); } };
}
