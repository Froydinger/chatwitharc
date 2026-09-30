import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MessageQueueView } from '@/components/MessageQueue';
import { useComposerQueue } from '@/hooks/chat-input/useComposerQueue';
import { snapshotComposerRequest, type ComposerRequestSnapshot, type ComposerDispatchScope } from '@/lib/chat-input/types';
import { useMessageQueueStore } from '@/store/useMessageQueueStore';

/** Isolated DEV fixture: synthetic acknowledgement, no auth, history or provider calls. */
export function installComposerQueueQA() {
  if (!import.meta.env.DEV) throw new Error('DEV-only fixture');
  useMessageQueueStore.setState({ queue: [], failed: [], isPaused: false, isOpen: false });
  const target = document.createElement('div');
  target.id = 'arc-queue-qa';
  target.className = 'fixed inset-0 z-[10000] bg-background p-4 text-foreground';
  document.body.appendChild(target);
  const root = createRoot(target);
  const started: ComposerRequestSnapshot[] = [];
  let updateScope: (scope: ComposerDispatchScope) => void;
  let updateDraft: (text: string) => void;
  let finish: (outcome: 'complete' | 'failed' | 'cancelled') => void = () => {};
  let currentScope: ComposerDispatchScope = { ownerId: 'fixture-owner', sessionId: 'chat-b', executionMode: 'ask' };
  function Fixture() {
    const [scope, setScope] = useState(currentScope);
    const [busy, setBusy] = useState(false);
    const [draft, setDraft] = useState('');
    updateScope = setScope; updateDraft = setDraft; currentScope = scope;
    const queue = useComposerQueue({
      scope, corporateMode: false, busy, isBusy: () => busy,
      dispatch: request => {
        started.push(request);
        setBusy(true);
        return new Promise<void>((resolve, reject) => {
          finish = outcome => {
            setBusy(false);
            if (outcome === 'complete') resolve();
            else if (outcome === 'cancelled') reject(new DOMException('Stopped', 'AbortError'));
            else reject(new Error('Synthetic offline failure'));
          };
        });
      },
    });
    return <div className="mx-auto max-w-xl space-y-4">
      <p>Offline queue fixture · {scope.sessionId}</p>
      <MessageQueueView ownerId={scope.ownerId} currentSessionId={scope.sessionId} executionMode={scope.executionMode}
        isLoading={busy} onSendMessage={queue.sendQueuedRequest} onRetryRequest={queue.retryRequest} />
      <textarea aria-label="Newer draft" value={draft} onChange={event => setDraft(event.target.value)} className="w-full rounded-xl border bg-background p-3" />
    </div>;
  }
  root.render(<Fixture />);
  return {
    started,
    setScope: (scope: ComposerDispatchScope) => updateScope(scope),
    setDraft: (text: string) => updateDraft(text),
    enqueue: (content: string, files: File[] = []) => {
      const request = snapshotComposerRequest({
        content, images: files, documents: [], ownerId: 'fixture-owner', sessionId: 'chat-a', executionMode: 'ask',
        modes: { image: false, code: false, canvas: false, search: false, git: false, regularChat: false, editImages: false },
        reasoningSelection: 'medium', corporateMode: false, appIntent: null,
        workspace: { isOpen: false, canvasType: 'writing', content: '', codeLanguage: 'html' },
        imageOptions: { aspect: 'auto', editAspect: 'auto', count: 1 },
      });
      useMessageQueueStore.getState().addToQueue(request);
      return request;
    },
    finish: (outcome: 'complete' | 'failed' | 'cancelled') => finish(outcome),
    stop: () => { useMessageQueueStore.getState().pause(); finish('cancelled'); },
    state: () => ({ queue: useMessageQueueStore.getState().queue.length, failed: useMessageQueueStore.getState().failed.length, paused: useMessageQueueStore.getState().isPaused }),
    dispose: () => { root.unmount(); target.remove(); useMessageQueueStore.getState().clearQueue(); },
  };
}
