import { useEffect } from "react";
import { useAccentStore } from "@/store/useAccentStore";

export function useTheme() {
  const themeMode = useAccentStore((s) => s.themeMode);

  useEffect(() => {
    const root = document.documentElement;

    const apply = (isLight: boolean) => {
      // Disable transitions during theme swap for instant switching
      root.classList.add("theme-switching");
      if (isLight) {
        root.classList.remove("dark");
        root.classList.add("light");
      } else {
        root.classList.remove("light");
        root.classList.add("dark");
      }
      // Force a reflow then re-enable transitions on next frame
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      root.offsetHeight;
      requestAnimationFrame(() => {
        root.classList.remove("theme-switching");
      });
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
