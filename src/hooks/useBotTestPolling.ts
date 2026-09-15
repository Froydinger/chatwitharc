import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useBotTestStore, type BotTestFrame } from '@/store/useBotTestStore';

const POLL_INTERVAL_MS = 600;
// A run that never reports done (expired sandbox, killed runner) must not poll forever.
const MAX_POLL_MS = 6 * 60 * 1000;

/**
 * Polls browser-test-status while a run is active and feeds frames into the
 * store. Mirrors how the other job-status endpoints are consumed.
 */
export function useBotTestPolling() {
  const runId = useBotTestStore((s) => s.runId);
  const status = useBotTestStore((s) => s.status);
  const startedAtRef = useRef<number>(0);

  useEffect(() => {
    if (!runId || (status !== 'preparing' && status !== 'running')) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    startedAtRef.current = Date.now();

    const poll = async () => {
      if (cancelled) return;

      if (Date.now() - startedAtRef.current > MAX_POLL_MS) {
        useBotTestStore.getState().endRun('failed');
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke('browser-test-status', {
          body: { runId, sinceIndex: useBotTestStore.getState().nextIndex },
        });

        if (!cancelled && !error && data) {
          const frames: BotTestFrame[] = Array.isArray(data.frames) ? data.frames : [];
          if (frames.length) useBotTestStore.getState().pushFrames(frames);
          if (data.done) {
            useBotTestStore.getState().endRun(data.status === 'failed' ? 'failed' : 'passed');
            return;
          }
        }
      } catch {
        // Transient failure: keep polling until the overall deadline.
      }

      if (!cancelled) timer = setTimeout(poll, POLL_INTERVAL_MS);
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [runId, status]);
}
