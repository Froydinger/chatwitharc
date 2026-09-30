import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** Place inside `.t-acc[data-open]`. Keep closing content mounted only for its
 * CSS transition; an interrupted close preserves the same DOM and edit state. */
export function AccordionPanel({ open, id, children }: { open: boolean; id?: string; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const [retained, setRetained] = useState(open);
  useLayoutEffect(() => {
    if (open) { setRetained(true); return; }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setRetained(false); return; }
    // Read resolved transition durations: motion preferences may express the
    // --acc-collapse token as calc(...), which cannot be parsed as a number.
    const values = panel.current ? getComputedStyle(panel.current).transitionDuration.split(",") : ["0s"];
    const duration = Math.max(...values.map(value => {
      const number = Number.parseFloat(value) || 0;
      return value.trim().endsWith("ms") ? number : number * 1000;
    }));
    const timer = window.setTimeout(() => setRetained(false), duration);
    return () => window.clearTimeout(timer);
  }, [open]);
  return <div ref={panel} id={id} className="t-acc-panel" style={!open && !retained ? { marginTop: 0 } : undefined} onTransitionEnd={event => {
    if (!open && event.target === event.currentTarget && event.propertyName === "grid-template-rows") setRetained(false);
  }}>
    <div className="t-acc-panel-inner min-h-0" aria-hidden={!open} {...(!open ? { inert: "" } : {})}>
      {(open || retained) && children}
    </div>
  </div>;
}
