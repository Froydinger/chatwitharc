import type { CSSProperties, ReactElement } from "react";
import { Presence } from "@radix-ui/react-presence";
import { Slot } from "@radix-ui/react-slot";

export type TransitionPreset = "fade" | "dropdown" | "modal" | "panel" | "page" | "text";

/** Native React orchestration for transitions.dev patterns. No extra layout node.
 * Radix retains the element through its CSS exit animation and cancels removal
 * when it reopens. Reduced motion removes the animation and unmounts immediately.
 */
export function Transition({ children, show = true, preset = "fade", delay = 0 }: {
  children: ReactElement;
  show?: boolean;
  preset?: TransitionPreset;
  /** Seconds, matching existing stagger offsets. */
  delay?: number;
}) {
  return (
    <Presence present={show}>
      <Slot
        className={`arc-transition arc-transition-${preset}`}
        data-motion-state={show ? "open" : "closed"}
        aria-hidden={!show || undefined}
        {...(!show ? { inert: "" } : {})}
        style={{ "--arc-motion-delay": `${Math.min(Math.max(delay, 0), 0.3)}s` } as CSSProperties}
      >
        {children}
      </Slot>
    </Presence>
  );
}
