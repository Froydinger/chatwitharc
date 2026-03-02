import { useEffect } from "react";

export function useTheme() {
  // Dark mode only - always enforce dark and remove light class
  useEffect(() => {
    document.documentElement.classList.remove("light");
    document.documentElement.classList.add("dark");
  }, []);

  // Accent color CSS variables are managed entirely by useAccentColor hook.
  // This hook only ensures dark mode class is applied.
}
