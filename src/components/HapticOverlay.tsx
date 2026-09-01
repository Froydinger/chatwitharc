import { useEffect, useRef } from "react";

/**
 * HapticOverlay previously rendered an invisible native iOS switch (<input type="checkbox" switch>)
 * over buttons to trigger native iOS haptics. However, on iOS Mobile Safari / WebKit, nesting interactive
 * input controls inside <button> elements captures touch/pointer events and prevents click handlers
 * from reaching parent buttons.
 *
 * Returning null ensures all buttons, tabs, and auth controls work 100% reliably across all iOS devices.
 */
export function HapticOverlay() {
  return null;
}

