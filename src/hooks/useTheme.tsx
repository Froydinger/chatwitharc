import { useEffect } from "react";
import { useAccentStore } from "@/store/useAccentStore";

export function useTheme() {
  const accentColor = useAccentStore((s) => s.accentColor);

  // Light mode activates only when the "white" accent is selected; everything else stays dark.
  useEffect(() => {
    const root = document.documentElement;
    if (accentColor === "white") {
      root.classList.remove("dark");
      root.classList.add("light");
    } else {
      root.classList.remove("light");
      root.classList.add("dark");
    }
  }, [accentColor]);
}
