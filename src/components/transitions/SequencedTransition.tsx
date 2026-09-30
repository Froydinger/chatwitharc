import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Transition, type TransitionPreset } from './Transition';

/** Exit the committed page before mounting the latest requested page.
 * Rapid selection changes coalesce; reopened pages cancel their pending exit. */
export function SequencedTransition({ contentKey, children, className, preset = 'page' }: {
  contentKey: string;
  children: ReactNode;
  className?: string;
  preset?: TransitionPreset;
}) {
  const [displayedKey, setDisplayedKey] = useState(contentKey);
  const committed = useRef(children);
  const latestKey = useRef(contentKey);
  const element = useRef<HTMLDivElement>(null);
  const open = displayedKey === contentKey;
  useLayoutEffect(() => {
    latestKey.current = contentKey;
    if (open) committed.current = children;
  });
  useLayoutEffect(() => {
    if (open) return;
    const node = element.current;
    if (!node) { setDisplayedKey(latestKey.current); return; }
    const finish = () => setDisplayedKey(latestKey.current);
    const handleEnd = (event: AnimationEvent) => { if (event.target === node) finish(); };
    node.addEventListener('animationend', handleEnd);
    const style = getComputedStyle(node);
    const milliseconds = (value: string) => value.endsWith('ms') ? parseFloat(value) : parseFloat(value) * 1000;
    const durations = style.animationDuration.split(',').map(milliseconds);
    const delays = style.animationDelay.split(',').map(milliseconds);
    const duration = Math.max(0, ...durations.map((value, i) => value + (delays[i % delays.length] || 0)));
    // A computed-duration fallback also settles reduced motion and browsers
    // that suppress animation events when a tab is hidden.
    const timer = window.setTimeout(finish, duration);
    return () => { window.clearTimeout(timer); node.removeEventListener('animationend', handleEnd); };
  }, [open, contentKey, displayedKey, preset]);
  return <Transition show={open} preset={preset}>
    <div ref={element} className={className}>{open ? children : committed.current}</div>
  </Transition>;
}
