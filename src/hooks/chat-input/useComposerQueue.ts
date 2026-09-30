import { useEffect, useRef, useState } from 'react';
import { useMessageQueueStore } from '@/store/useMessageQueueStore';
import { ownsComposerRequest, type ComposerDispatchScope, type ComposerRequestSnapshot } from '@/lib/chat-input/types';

interface Options {
  scope: ComposerDispatchScope;
  corporateMode: boolean;
  busy: boolean;
  isBusy: () => boolean;
  dispatch: (request: ComposerRequestSnapshot) => Promise<false | void>;
}

/** One lifetime owns idle draining, manual dispatch and recovery claims. */
export function useComposerQueue(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const active = useRef(false);
  const [dispatching, setDispatching] = useState(false);
  const head = useMessageQueueStore(s => s.queue[0]);
  const paused = useMessageQueueStore(s => s.isPaused);
  const canDispatch = (request: ComposerRequestSnapshot) => {
    const current = latest.current;
    return !active.current && !current.busy && !current.isBusy()
      && request.corporateMode === current.corporateMode && ownsComposerRequest(request, current.scope);
  };
  const run = async (request: ComposerRequestSnapshot, retry = false) => {
    if (!canDispatch(request)) return;
    const current = latest.current;
    const store = useMessageQueueStore.getState();
    const claimed = retry ? store.takeFailure(current.scope, request.id)?.request
      : store.popNext(current.scope, request.id);
    if (!claimed) return;
    active.current = true;
    setDispatching(true);
    try {
      if (await current.dispatch(claimed) === false && ownsComposerRequest(claimed, latest.current.scope)) {
        useMessageQueueStore.getState().retainFailure(claimed, 'Request was not accepted.');
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError') && ownsComposerRequest(claimed, latest.current.scope)) {
        useMessageQueueStore.getState().retainFailure(claimed,
          error instanceof Error ? error.message : 'Request failed.');
      }
    } finally {
      active.current = false;
      setDispatching(false);
    }
  };
  const runRef = useRef(run);
  runRef.current = run;
  useEffect(() => {
    useMessageQueueStore.getState().discardOtherOwners(options.scope.ownerId);
  }, [options.scope.ownerId]);
  useEffect(() => {
    if (!head || paused || dispatching || !canDispatch(head)) return;
    const timer = setTimeout(() => void runRef.current(head), 600);
    return () => clearTimeout(timer);
  }, [head, paused, dispatching, options.busy, options.scope.ownerId,
    options.scope.sessionId, options.scope.executionMode, options.corporateMode]);
  return {
    sendQueuedRequest: (request: ComposerRequestSnapshot) => void run(request),
    retryRequest: (request: ComposerRequestSnapshot) => void run(request, true),
  };
}
