import { useEffect } from "react";

export function useTheme() {
  // Dark mode only - always set to dark
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  // Accent color CSS variables are managed entirely by useAccentColor hook.
  // This hook only ensures dark mode class is applied.
}
