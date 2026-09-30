import { useEffect, useRef, type MutableRefObject } from 'react';
import type { ComposerRequestSnapshot } from '@/lib/chat-input/types';

type SubmissionOptions = {
  ownerId: string | null;
  inputValue: string;
  canSubmitWork: (content: string) => boolean;
  execute: (override?: string, captured?: ComposerRequestSnapshot) => Promise<false | void>;
  enqueue: (content: string, clearDraft: boolean) => void;
  cancel: () => void;
};

/** Admission is synchronous even before React's loading projection renders.
 * This factory also lets characterization tests execute the production guard. */
export function createComposerSubmitter({ ownerId, inputValue, canSubmitWork, execute, enqueue, busyRef, ownerRef }: Omit<SubmissionOptions, 'cancel'> & {
  busyRef: MutableRefObject<boolean>;
  ownerRef: MutableRefObject<string | null>;
}) {
  return async (messageOverride?: string, captured?: ComposerRequestSnapshot): Promise<false | void> => {
    const content = captured?.content ?? messageOverride ?? inputValue;
    const workBypass = canSubmitWork(content);
    if (busyRef.current && !workBypass) {
      if (!captured) enqueue(content, !messageOverride);
      return;
    }
    if (!workBypass) { busyRef.current = true; ownerRef.current = ownerId; }
    try { return await execute(messageOverride, captured); }
    finally { if (!workBypass) busyRef.current = false; }
  };
}

/** Foreground admission belongs to the mounted composer. Durable Work keeps
 * its existing independent parent/service lifetime and busy bypass. */
export function useComposerSubmission(options: SubmissionOptions) {
  const { ownerId, cancel } = options;
  const busyRef = useRef(false);
  const ownerRef = useRef<string | null>(null);
  useEffect(() => {
    if (busyRef.current && ownerRef.current !== ownerId) cancel();
  }, [ownerId, cancel]);
  const handleSend = createComposerSubmitter({ ...options, busyRef, ownerRef });
  return { handleSend, foregroundSubmissionRef: busyRef };
}
