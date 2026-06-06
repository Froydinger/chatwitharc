// iOS web haptics.
//
// iOS Safari has no Web Vibration API, so navigator.vibrate() is silent there.
// The workaround (popularized by @mickces / project-fathom): the native iOS
// switch control (`<input type="checkbox" switch>`, iOS 17.4+) plays a real
// haptic when toggled by a genuine user tap. Apple patched JS-*triggered*
// toggles in iOS 26.5, but a real finger tap on the switch still buzzes — so we
// overlay an invisible switch on top of a button and let the tap land on it
// (see HapticOverlay). On Android / other platforms we fall back to vibrate().

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS reports as Macintosh but is touch-capable.
    (ua.includes("Macintosh") && navigator.maxTouchPoints > 1)
  );
}

/**
 * Fire a haptic for a JS-initiated event (button handlers, etc.).
 * Works on Android (and pre-26.5 iOS via the legacy switch trick). On modern
 * iOS the reliable path is a real tap on a <HapticOverlay/>, not this call.
 */
export function triggerHaptic(pattern: number | number[] = 10): void {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate(pattern);
  }
}
