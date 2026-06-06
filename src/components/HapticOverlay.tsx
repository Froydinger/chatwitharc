import { useEffect, useRef } from "react";
import { isIOS } from "@/lib/haptics";

/**
 * Invisible native iOS switch that plays a haptic when the user taps the area it
 * covers. Drop it inside a tappable element (the parent should be a button or
 * have an onClick): the tap lands on this switch (firing the native haptic),
 * then the click bubbles up to the parent's handler.
 *
 * Renders nothing on non-iOS platforms (those use navigator.vibrate instead),
 * which also avoids nesting an interactive control where it isn't needed.
 */
export function HapticOverlay() {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // `switch` is the iOS-specific attribute that turns a checkbox into the
    // native switch control; React doesn't type it, so set it imperatively.
    ref.current?.setAttribute("switch", "");
  }, []);

  if (!isIOS()) return null;

  return (
    <input
      ref={ref}
      type="checkbox"
      aria-hidden="true"
      tabIndex={-1}
      // Cover the parent and stay a *native* control (no appearance reset) so
      // iOS still plays the haptic; opacity:0 keeps it invisible. We must NOT
      // preventDefault — the toggle has to actually happen for the buzz to fire.
      className="absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0"
      style={{ zIndex: 1 }}
    />
  );
}
