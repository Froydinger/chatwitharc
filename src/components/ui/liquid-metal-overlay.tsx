import { useEffect, useState } from "react";
import { MetalFx } from "metal-fx";

function getAppTheme(): "dark" | "light" {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("light") ? "light" : "dark";
}

/**
 * A layout-neutral Liquid Metal layer for large glass surfaces.
 * It uses metal-fx's shared WebGL renderer without wrapping or resizing content.
 */
export function LiquidMetalOverlay({
  preset = "silver",
  strength = 0.25,
}: {
  preset?: "silver" | "chromatic";
  strength?: number;
}) {
  const [theme, setTheme] = useState<"dark" | "light">(getAppTheme);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const syncTheme = () => setTheme(getAppTheme());
    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => setReduceMotion(motionQuery.matches);
    syncMotion();
    motionQuery.addEventListener("change", syncMotion);

    return () => {
      observer.disconnect();
      motionQuery.removeEventListener("change", syncMotion);
    };
  }, []);

  return (
    <div className="liquid-metal-overlay-frame" style={{ opacity: 0.28 }} aria-hidden="true">
      <MetalFx
        preset={preset}
        strength={Math.min(strength, 0.28)}
        theme={theme}
        paused={reduceMotion}
        normalizeHostStyles={false}
        className="liquid-metal-overlay"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      >
        <span className="liquid-metal-overlay-host" />
      </MetalFx>
    </div>
  );
}
