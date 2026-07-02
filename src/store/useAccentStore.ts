import { create } from "zustand";

export type AccentColor = "red" | "blue" | "green" | "yellow" | "purple" | "orange" | "noir" | "gold";
export type ThemeMode = "light" | "dark" | "system";

function isAccentColor(value: unknown): value is AccentColor {
  return (
    value === "red" ||
    value === "blue" ||
    value === "green" ||
    value === "yellow" ||
    value === "purple" ||
    value === "orange" ||
    value === "noir" ||
    value === "gold"
  );
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

type AccentStore = {
  accentColor: AccentColor;
  themeMode: ThemeMode;
  setAccentColorLocal: (color: AccentColor) => void;
  setThemeMode: (mode: ThemeMode) => void;
  cycleThemeMode: () => void;
};

const THEME_CYCLE: ThemeMode[] = ["dark", "light", "system"];

export const useAccentStore = create<AccentStore>((set, get) => ({
  accentColor: (() => {
    try {
      const saved = localStorage.getItem("accentColor");
      return isAccentColor(saved) ? saved : "noir";
    } catch {
      return "noir";
    }
  })(),
  themeMode: (() => {
    try {
      const saved = localStorage.getItem("themeMode");
      if (isThemeMode(saved)) return saved;
      // Legacy migration: only an explicit lightMode boolean overrides the new default
      const legacy = localStorage.getItem("lightMode");
      if (legacy === "false") return "dark";
      if (legacy === "true") return "light";
      // Default for new users: follow OS preference
      return "system";
    } catch {
      return "system";
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
  setThemeMode: (mode) => {
    try {
      localStorage.setItem("themeMode", mode);
    } catch {
      // ignore
    }
    set({ themeMode: mode });
  },
  cycleThemeMode: () => {
    const cur = get().themeMode;
    const next = THEME_CYCLE[(THEME_CYCLE.indexOf(cur) + 1) % THEME_CYCLE.length];
    try {
      localStorage.setItem("themeMode", next);
    } catch {
      // ignore
    }
    set({ themeMode: next });
  },
}));
