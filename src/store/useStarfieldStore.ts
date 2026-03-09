import { create } from "zustand";

type StarfieldStore = {
  showStarfield: boolean;
  setShowStarfield: (show: boolean) => void;
};

export const useStarfieldStore = create<StarfieldStore>((set) => ({
  showStarfield: (() => {
    try {
      const saved = localStorage.getItem("showStarfield");
      return saved === null ? true : saved === "true";
    } catch {
      return true;
    }
  })(),
  setShowStarfield: (show) => {
    try {
      localStorage.setItem("showStarfield", String(show));
    } catch {}
    set({ showStarfield: show });
  },
}));
