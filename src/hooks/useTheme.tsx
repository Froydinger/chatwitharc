import { useEffect } from "react";
import { useAccentStore } from "@/store/useAccentStore";

export function useTheme() {
  const themeMode = useAccentStore((s) => s.themeMode);

  // Resolve themeMode → effective light/dark. "system" follows OS preference and listens for changes.
  useEffect(() => {
    const root = document.documentElement;

    const apply = (isLight: boolean) => {
      if (isLight) {
        root.classList.remove("dark");
        root.classList.add("light");
      } else {
        root.classList.remove("light");
        root.classList.add("dark");
      }
    };

    if (themeMode === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: light)");
      apply(mq.matches);
      const handler = (e: MediaQueryListEvent) => apply(e.matches);
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }

    apply(themeMode === "light");
  }, [themeMode]);
}
