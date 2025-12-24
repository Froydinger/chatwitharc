import { create } from "zustand";

export type AccentColor = "red" | "blue" | "green" | "yellow" | "purple" | "orange" | "noir";

function isAccentColor(value: unknown): value is AccentColor {
  return (
    value === "red" ||
    value === "blue" ||
    value === "green" ||
    value === "yellow" ||
    value === "purple" ||
    value === "orange" ||
    value === "noir"
  );
}

type AccentStore = {
  accentColor: AccentColor;
  setAccentColorLocal: (color: AccentColor) => void;
};

export const useAccentStore = create<AccentStore>((set) => ({
  accentColor: (() => {
    try {
      const saved = localStorage.getItem("accentColor");
      return isAccentColor(saved) ? saved : "blue";
    } catch {
      return "blue";
    }
  })(),
  setAccentColorLocal: (color) => {
    try {
      localStorage.setItem("accentColor", color);
    } catch {
      // ignore
    }
    set({ accentColor: color });
  },
}));
