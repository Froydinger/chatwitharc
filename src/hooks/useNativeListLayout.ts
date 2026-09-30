import { useLayoutEffect, useRef } from 'react';

/** Native position tween for keyed rows. Layout coordinates avoid measuring
 * ancestor entrance transforms; interrupted movement starts at its visible
 * offset. No clones, retained removed requests or dispatch side effects. */
export function useNativeListLayout() {
  const container = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<HTMLElement, { top: number; left: number }>());
  const animations = useRef(new Map<HTMLElement, Animation>());
  useLayoutEffect(() => {
    const rows = [...(container.current?.querySelectorAll<HTMLElement>('[data-layout-row]') ?? [])];
    const next = new Map<HTMLElement, { top: number; left: number }>();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const row of rows) {
      const position = { top: row.offsetTop, left: row.offsetLeft };
      const previous = positions.current.get(row);
      const running = animations.current.get(row);
      next.set(row, position);
      // Typing or status renders must not restart unchanged movement.
      if (running && !reduced && previous?.top === position.top && previous.left === position.left) continue;
      const transform = running && getComputedStyle(row).transform;
      const matrix = transform && transform !== 'none' ? new DOMMatrixReadOnly(transform) : null;
      running?.cancel();
      animations.current.delete(row);
      if (!previous || reduced || typeof row.animate !== 'function') continue;
      const x = previous.left - position.left + (matrix?.m41 ?? 0);
      const y = previous.top - position.top + (matrix?.m42 ?? 0);
      if (Math.abs(x) < .5 && Math.abs(y) < .5) continue;
      const style = getComputedStyle(row);
      const token = style.getPropertyValue('--arc-motion-fast').trim();
      const duration = parseFloat(token) * (token.endsWith('ms') ? 1 : 1000);
      const animation = row.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: 'none' }], {
        duration: Number.isFinite(duration) ? duration : 250,
        easing: style.getPropertyValue('--arc-motion-ease').trim() || 'ease-out',
      });
      animations.current.set(row, animation);
      animation.onfinish = () => { if (animations.current.get(row) === animation) animations.current.delete(row); };
    }
    for (const [row, animation] of animations.current) if (!next.has(row)) { animation.cancel(); animations.current.delete(row); }
    positions.current = next;
  });
  useLayoutEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const cancel = () => {
      for (const animation of animations.current.values()) animation.cancel();
      animations.current.clear();
    };
    const changed = () => { if (media.matches) cancel(); };
    media.addEventListener('change', changed);
    return () => { media.removeEventListener('change', changed); cancel(); positions.current.clear(); };
  }, []);
  return container;
}
