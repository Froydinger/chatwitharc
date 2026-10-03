export function sidebarSwipeAction({ startX, dx, dy, width, open, inside }: { startX: number; dx: number; dy: number; width: number; open: boolean; inside: boolean }): 'open' | 'close' | 'dashboard' | null {
  // Require horizontal intent while preserving vertical scrolling.
  if (startX < 0 || startX > width || Math.abs(dx) < 64 || Math.abs(dy) > 72 || Math.abs(dx) < Math.abs(dy) * 1.5) return null;
  if (open) return inside && dx < -64 ? 'close' : null;
  if (startX >= width - 40 && dx < -64) return 'dashboard';
  return startX <= Math.min(width / 3, 140) && dx > 64 ? 'open' : null;
}
