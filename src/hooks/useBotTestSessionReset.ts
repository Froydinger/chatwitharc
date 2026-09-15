import { useEffect, useRef } from 'react';
import { useArcStore } from '@/store/useArcStore';
import { useBotTestStore } from '@/store/useBotTestStore';
import { useSandboxStore } from '@/store/useSandboxStore';
import { useGitStore } from '@/store/useGitStore';
import { supabase } from '@/integrations/supabase/client';

/**
 * A live preview and a running bot test belong to the chat that started them.
 * Closing that chat or opening a new one tears both down, rather than leaving a
 * viewer pinned above the composer pointing at another conversation's sandbox.
 */
export function useBotTestSessionReset() {
  const currentSessionId = useArcStore((s) => s.currentSessionId);
  const previous = useRef<string | null>(currentSessionId);

  useEffect(() => {
    if (previous.current === currentSessionId) return;
    previous.current = currentSessionId;

    useBotTestStore.getState().reset();

    const { previewUrl, closePreview } = useSandboxStore.getState();
    if (previewUrl) {
      closePreview();
      const repo = useGitStore.getState().selectedRepo;
      if (repo) {
        // Free the sandbox slot instead of letting it idle out the 20-minute window.
        void supabase.functions
          .invoke('chat', { body: { action: 'close_sandbox', repo } })
          .catch(() => undefined);
      }
    }
  }, [currentSessionId]);
}
