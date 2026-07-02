import { create } from "zustand";

type StarfieldStore = {
  showStarfield: boolean;
  setShowStarfield: (show: boolean) => void;
};

export const useStarfieldStore = create<StarfieldStore>((set) => ({
  showStarfield: (() => {
    try {
      const saved = localStorage.getItem("showStarfield");
      // Default OFF — users opt-in via Appearance settings
      return saved === null ? false : saved === "true";
    } catch {
      return false;
    }
  })(),
  setShowStarfield: (show) => {
    try {
      localStorage.setItem("showStarfield", String(show));
    } catch {}
    set({ showStarfield: show });
  },
}));
