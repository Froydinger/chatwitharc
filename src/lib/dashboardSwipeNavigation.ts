/** One gesture owner for the dashboard shell and its embedded libraries. */
export function installDashboardSwipeNavigation<T extends string>({
  tabs, activeTab, onTab, onExit,
}: { tabs: readonly T[]; activeTab: T; onTab: (tab: T) => void; onExit: () => void }) {
  let gesture: { x: number; y: number; dx: number; dy: number } | null = null;
  const reset = () => { gesture = null; };
  const blocked = (target: EventTarget | null) => {
    if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) return true;
    if (!(target instanceof Element)) return false;
    if (target.closest('input, textarea, select, [contenteditable="true"], [data-dashboard-nav-pill], [data-no-swipe], [data-horizontal-scroll]')) return true;
    let element: Element | null = target;
    while (element && element !== document.body && element !== document.documentElement) {
      const overflow = window.getComputedStyle(element).overflowX;
      if ((overflow === 'auto' || overflow === 'scroll') && element.scrollWidth > element.clientWidth + 4) return true;
      element = element.parentElement;
    }
    return false;
  };
  const start = (event: TouchEvent) => {
    reset();
    if (event.touches.length !== 1 || window.getSelection()?.toString() || blocked(event.target)) return;
    const touch = event.touches[0];
    gesture = { x: touch.clientX, y: touch.clientY, dx: 0, dy: 0 };
  };
  const move = (event: TouchEvent) => {
    if (!gesture || event.touches.length !== 1) { reset(); return; }
    const touch = event.touches[0];
    gesture.dx = touch.clientX - gesture.x;
    gesture.dy = touch.clientY - gesture.y;
    if (Math.abs(gesture.dy) > 28 && Math.abs(gesture.dy) > Math.abs(gesture.dx)) { reset(); return; }
    if (Math.abs(gesture.dx) > 28 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.8 && event.cancelable) event.preventDefault();
  };
  const end = (event: TouchEvent) => {
    const current = gesture;
    reset();
    if (!current) return;
    const touch = event.changedTouches[0];
    const dx = touch ? touch.clientX - current.x : current.dx;
    const dy = touch ? touch.clientY - current.y : current.dy;
    if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
    const index = tabs.indexOf(activeTab);
    if (index < 0) return;
    if (dx > 0 && index === 0) { onExit(); return; }
    const next = tabs[index + (dx < 0 ? 1 : -1)];
    if (next) onTab(next);
  };
  window.addEventListener('touchstart', start, { passive: true });
  window.addEventListener('touchmove', move, { passive: false });
  window.addEventListener('touchend', end, { passive: true });
  window.addEventListener('touchcancel', reset, { passive: true });
  return () => {
    window.removeEventListener('touchstart', start);
    window.removeEventListener('touchmove', move);
    window.removeEventListener('touchend', end);
    window.removeEventListener('touchcancel', reset);
  };
}
