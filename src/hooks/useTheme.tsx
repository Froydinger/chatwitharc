import { useEffect } from "react";
import { useAccentStore } from "@/store/useAccentStore";

export function useTheme() {
  const lightMode = useAccentStore((s) => s.lightMode);

  // Light mode is a standalone toggle (the "white" tile in the accent picker).
  // When on, applies .light to the documentElement; the selected accent color stays as-is and its lightPrimary tokens take over.
  useEffect(() => {
    const root = document.documentElement;
    if (lightMode) {
      root.classList.remove("dark");
      root.classList.add("light");
    } else {
      root.classList.remove("light");
      root.classList.add("dark");
    }
  }, [lightMode]);
}
