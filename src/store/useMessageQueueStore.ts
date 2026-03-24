import { create } from 'zustand';

export interface QueuedMessage {
  id: string;
  content: string;
  createdAt: number;
}

interface MessageQueueState {
  queue: QueuedMessage[];
  isPaused: boolean;
  isOpen: boolean;

  addToQueue: (content: string) => void;
  removeFromQueue: (id: string) => void;
  editInQueue: (id: string, content: string) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  clearQueue: () => void;
  togglePause: () => void;
  setOpen: (open: boolean) => void;
  popNext: () => QueuedMessage | null;
}

export const useMessageQueueStore = create<MessageQueueState>((set, get) => ({
  queue: [],
  isPaused: false,
  isOpen: false,

  addToQueue: (content) => {
    const msg: QueuedMessage = {
      id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      content,
      createdAt: Date.now(),
    };
    set((s) => ({ queue: [...s.queue, msg], isOpen: true }));
  },

  removeFromQueue: (id) => {
    set((s) => {
      const queue = s.queue.filter((m) => m.id !== id);
      return { queue, isOpen: queue.length > 0 };
    });
  },

  editInQueue: (id, content) => {
    set((s) => ({
      queue: s.queue.map((m) => (m.id === id ? { ...m, content } : m)),
    }));
  },

  reorderQueue: (fromIndex, toIndex) => {
    set((s) => {
      const queue = [...s.queue];
      const [moved] = queue.splice(fromIndex, 1);
      queue.splice(toIndex, 0, moved);
      return { queue };
    });
  },

  clearQueue: () => set({ queue: [], isOpen: false }),

  togglePause: () => set((s) => ({ isPaused: !s.isPaused })),

  setOpen: (open) => set({ isOpen: open }),

  popNext: () => {
    const { queue, isPaused } = get();
    if (isPaused || queue.length === 0) return null;
    const [next, ...rest] = queue;
    set({ queue: rest, isOpen: rest.length > 0 });
    return next;
  },
}));
