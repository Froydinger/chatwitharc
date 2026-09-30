import { create } from 'zustand';
/** Ephemeral display only: partial answers never enter saved chat history. */
export const useLiveAnswerStore = create<{
  answer: { requestId: string; sessionId: string; content: string; timestamp: Date } | null;
  show(requestId: string, sessionId: string, content: string): void;
  clear(requestId: string): void;
}>((set) => ({
  answer: null,
  show: (requestId, sessionId, content) => set(state => ({ answer: {
    requestId, sessionId, content,
    timestamp: state.answer?.requestId === requestId ? state.answer.timestamp : new Date(),
  } })),
  clear: requestId => set(state => state.answer?.requestId === requestId ? { answer: null } : state),
}));
