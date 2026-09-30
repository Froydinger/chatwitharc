import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { useComposerSubmission } from '@/hooks/chat-input/useComposerSubmission';

/** Real admission hook, synthetic executor only. No account/provider writes. */
export function installComposerAdmissionQA() {
  if (!import.meta.env.DEV) throw new Error('Local QA only');
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const queued: string[] = [];
  const started: string[] = [];
  const outcomes: string[] = [];
  let cancellations = 0;
  let pending: { resolve: () => void; reject: (error: Error) => void } | null = null;
  let api: ReturnType<typeof useComposerSubmission>;
  let setOwner: (owner: string) => void;
  const cancel = () => { cancellations++; pending?.reject(new DOMException('Stopped', 'AbortError')); };
  function Fixture() {
    const [owner, updateOwner] = useState('owner-a');
    setOwner = updateOwner;
    api = useComposerSubmission({ ownerId: owner, inputValue: 'draft', cancel,
      canSubmitWork: () => false, enqueue: text => { queued.push(text); },
      execute: text => {
        started.push(text ?? 'draft');
        return new Promise<void>((resolve, reject) => { pending = { resolve, reject }; });
      },
    });
    return null;
  }
  flushSync(() => root.render(<Fixture />));
  return {
    started, queued, outcomes,
    send: (text: string) => { void api.handleSend(text).then(() => outcomes.push('returned'), error => outcomes.push(error.name)); },
    setOwner: (owner: string) => flushSync(() => setOwner(owner)),
    finish: (fail = false) => fail ? pending?.reject(new Error('Synthetic offline')) : pending?.resolve(),
    state: () => ({ busy: api.foregroundSubmissionRef.current, cancellations }),
    dispose: () => { flushSync(() => root.unmount()); host.remove(); },
  };
}
