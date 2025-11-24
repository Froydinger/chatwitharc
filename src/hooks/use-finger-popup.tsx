import { create } from 'zustand';

interface FingerPopup {
  id: string;
  message: string;
  x: number;
  y: number;
}

interface FingerPopupStore {
  popups: FingerPopup[];
  showPopup: (message: string, x: number, y: number) => void;
  removePopup: (id: string) => void;
}

export const useFingerPopup = create<FingerPopupStore>((set) => ({
  popups: [],
  showPopup: (message, x, y) => {
    const id = Math.random().toString(36).substring(7);
    set((state) => ({
      popups: [...state.popups, { id, message, x, y }],
    }));

    // Auto-remove after 1.5 seconds
    setTimeout(() => {
      set((state) => ({
        popups: state.popups.filter((p) => p.id !== id),
      }));
    }, 1500);
  },
  removePopup: (id) =>
    set((state) => ({
      popups: state.popups.filter((p) => p.id !== id),
    })),
}));
