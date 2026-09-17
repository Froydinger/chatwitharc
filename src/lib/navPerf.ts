/**
 * Minimal navigation timing, so a hang can be measured on the device instead of
 * guessed at from a desktop. Safari has no long-task observer and the Web
 * Inspector is not always reachable, so the numbers are surfaced in the UI.
 *
 * Three marks tell three different stories:
 *   nav   — tap to the destination component's first render. Large means the
 *           work is happening before this page: teardown, routing, chunk fetch.
 *   paint — tap to the first frame after that render actually commits. Large
 *           relative to nav means the render itself is expensive.
 *   sync  — whatever a page chooses to time inside itself.
 */
type NavMark = { label: string; startedAt: number };

const w = typeof window !== 'undefined' ? (window as any) : null;

export function markNavStart(label: string) {
  if (!w) return;
  w.__arcNav = { label, startedAt: performance.now() } as NavMark;
}

export function readNavMark(): NavMark | null {
  return w?.__arcNav ?? null;
}

export function clearNavMark() {
  if (w) w.__arcNav = null;
}

/** ms since the last markNavStart, or null if this arrival was not measured. */
export function msSinceNavStart(): number | null {
  const mark = readNavMark();
  if (!mark) return null;
  return Math.round(performance.now() - mark.startedAt);
}
