import { create } from "zustand";

export type AccentColor = "red" | "blue" | "green" | "yellow" | "purple" | "orange" | "noir" | "gold";
export type ThemeMode = "light" | "dark" | "system";

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
      // Accent selection has been retired. Normalize legacy browser state as
      // soon as Arc starts so every session uses the black-and-white palette.
      localStorage.setItem("accentColor", "noir");
      return "noir";
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
      // New users follow the device theme; useTheme falls back to noir/dark
      // when the browser cannot expose a system preference.
      return "system";
    } catch {
      return "system";
    }
  })(),

  setAccentColorLocal: (_color) => {
    try {
      localStorage.setItem("accentColor", "noir");
    } catch {
      // ignore
    }
    set({ accentColor: "noir" });
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
