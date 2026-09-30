import { useEffect, useState, type RefObject, type CSSProperties } from "react";

/** All floating surfaces share the same measured rectangle for this render.
 * Each caller still owns its existing stacking and unmeasured fallback. */
export function composerDockStyle(rect: Pick<DOMRect, 'top' | 'left' | 'width'> | null, viewportHeight: number, offset: number, fallbackBottom: number): CSSProperties & { bottom: string } {
  const bottom = rect
    ? `${Math.max(12, viewportHeight - rect.top + offset)}px`
    : `calc(${fallbackBottom}px + env(safe-area-inset-bottom, 0px))`;
  return rect ? { left: `${rect.left}px`, width: `${rect.width}px`, bottom } : { bottom };
}

/** One owner for the composer anchor subscriptions, with symmetric teardown. */
export function useComposerViewport(inputBarRef: RefObject<HTMLDivElement>) {
  // Tick to force re-render when the input bar's screen position can change
  // (window resize, scroll, soft keyboard open/close via visualViewport).
  // Used to anchor floating menus (ImageOptionsDock, UsageMeter) just above
  // the input bar rather than glued to the viewport bottom.
  const [, setViewportTick] = useState(0);
  useEffect(() => {
    const bump = () => setViewportTick((t) => (t + 1) % 1000000);
    window.addEventListener("resize", bump);
    window.addEventListener("scroll", bump, true);
    window.visualViewport?.addEventListener("resize", bump);
    window.visualViewport?.addEventListener("scroll", bump);
    return () => {
      window.removeEventListener("resize", bump);
      window.removeEventListener("scroll", bump, true);
      window.visualViewport?.removeEventListener("resize", bump);
      window.visualViewport?.removeEventListener("scroll", bump);
    };
  }, [inputBarRef]);

  // Re-render anchored previews when the input bar itself moves/resizes
  // (welcome screen re-centers when image previews appear, etc.)
  useEffect(() => {
    const el = inputBarRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const bump = () => setViewportTick((t) => (t + 1) % 1000000);
    const ro = new ResizeObserver(bump);
    ro.observe(el);
    const bodyRo = new ResizeObserver(bump);
    bodyRo.observe(document.body);
    return () => {
      ro.disconnect();
      bodyRo.disconnect();
    };
  }, [inputBarRef]);

  return inputBarRef.current?.getBoundingClientRect() ?? null;
}
