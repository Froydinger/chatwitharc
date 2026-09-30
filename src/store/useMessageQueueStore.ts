import { create } from 'zustand';
import { ownsComposerRequest, type ComposerRequestSnapshot, type ComposerDispatchScope } from '@/lib/chat-input/types';

export type QueuedMessage = ComposerRequestSnapshot;

interface MessageQueueState {
  queue: QueuedMessage[];
  failed: { request: ComposerRequestSnapshot; error: string }[];
  isPaused: boolean;
  isOpen: boolean;
  addToQueue: (request: ComposerRequestSnapshot) => void;
  removeFromQueue: (id: string) => void;
  editInQueue: (id: string, content: string) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  clearQueue: () => void;
  togglePause: () => void;
  pause: () => void;
  setOpen: (open: boolean) => void;
  popNext: (scope: ComposerDispatchScope, id?: string) => QueuedMessage | null;
  retainFailure: (request: ComposerRequestSnapshot, error: string) => void;
  takeFailure: (scope: ComposerDispatchScope, id: string) => { request: ComposerRequestSnapshot; error: string } | null;
  dismissFailure: (id: string) => void;
  discardOtherOwners: (ownerId: string | null) => void;
}

export const useMessageQueueStore = create<MessageQueueState>((set, get) => ({
  queue: [], failed: [], isPaused: false, isOpen: false,
  addToQueue: (request) => set(s => s.queue.some(item => item.id === request.id)
    ? s : { queue: [...s.queue, request], isOpen: true }),
  removeFromQueue: (id) => set(s => {
    const queue = s.queue.filter(m => m.id !== id);
    return { queue, isOpen: queue.length > 0 || s.failed.length > 0 };
  }),
  editInQueue: (id, content) => set(s => ({
    queue: s.queue.map(m => m.id === id ? Object.freeze({ ...m, content }) : m),
  })),
  reorderQueue: (fromIndex, toIndex) => set(s => {
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= s.queue.length || toIndex >= s.queue.length) return s;
    const queue = [...s.queue];
    const [moved] = queue.splice(fromIndex, 1);
    queue.splice(toIndex, 0, moved);
    return { queue };
  }),
  clearQueue: () => set({ queue: [], failed: [], isOpen: false }),
  togglePause: () => set(s => ({ isPaused: !s.isPaused })),
  pause: () => set({ isPaused: true }),
  setOpen: (isOpen) => set({ isOpen }),
  popNext: (scope, id) => {
    const { queue, isPaused } = get();
    const next = queue[0];
    // FIFO stays held until its owning chat/mode is active. Claim synchronously;
    // competing timers/buttons cannot dispatch this id twice.
    if (isPaused || !next || (id && next.id !== id) || !ownsComposerRequest(next, scope)) return null;
    const rest = queue.slice(1);
    set({ queue: rest, isOpen: rest.length > 0 || get().failed.length > 0 });
    return next;
  },
  retainFailure: (request, error) => set(s => ({
    failed: [...s.failed.filter(item => item.request.id !== request.id), { request, error }],
    isPaused: true, isOpen: true,
  })),
  takeFailure: (scope, id) => {
    const item = get().failed.find(item => item.request.id === id);
    if (!item || !ownsComposerRequest(item.request, scope)) return null;
    const failed = get().failed.filter(item => item.request.id !== id);
    set({ failed, isOpen: failed.length > 0 || get().queue.length > 0 });
    return item;
  },
  dismissFailure: (id) => set(s => {
    const failed = s.failed.filter(item => item.request.id !== id);
    return { failed, isOpen: failed.length > 0 || s.queue.length > 0 };
  }),
  discardOtherOwners: (ownerId) => set(s => {
    const queue = s.queue.filter(m => m.ownerId === ownerId);
    const failed = s.failed.filter(item => item.request.ownerId === ownerId);
    return { queue, failed, isOpen: queue.length > 0 || failed.length > 0 };
  }),
}));
