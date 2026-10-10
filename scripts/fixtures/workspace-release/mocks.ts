import { create } from 'zustand';
export const useChatPins = create<{ pinnedIds: string[]; setPinned: (id: string, value: boolean) => Promise<void> }>(set => ({
  pinnedIds: ['chat-one'],
  setPinned: async (id, value) => { set(state => ({ pinnedIds: value ? [...new Set([...state.pinnedIds, id])] : state.pinnedIds.filter(item => item !== id) })); },
}));
