/** Shared mobile/tablet detection for Arc Local safety limits. */
export function isMobileLocalDevice(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;

  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const touchPoints = navigator.maxTouchPoints || 0;
  const isAppleTouchTablet = platform === 'MacIntel' && touchPoints > 1;
  const isMobileUA = /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(ua);
  const isCoarseTablet = touchPoints > 1 && window.matchMedia?.('(pointer: coarse)').matches;

  return isMobileUA || isAppleTouchTablet || isCoarseTablet;
}