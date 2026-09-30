import { useFingerPopup } from '@/hooks/use-finger-popup';
import { useLayoutEffect, useRef, useState } from 'react';
import { Transition } from '@/components/transitions/Transition';

type Popup = ReturnType<typeof useFingerPopup.getState>['popups'][number];

export function FingerPopupContainer() {
  const popups = useFingerPopup((state) => state.popups);
  return <FingerPopupList popups={popups} />;
}

/** Keep removed visual notices for their native exit only. Store lifetime and
 * notifications remain owned by useFingerPopup. Reopening preserves the node. */
export function FingerPopupList({ popups }: { popups: Popup[] }) {
  const [retained, setRetained] = useState(popups);
  const nodes = useRef(new Map<string, HTMLDivElement>());
  const currentIds = new Set(popups.map(popup => popup.id));
  const displayed = [...popups, ...retained.filter(popup => !currentIds.has(popup.id))];
  useLayoutEffect(() => {
    setRetained(previous => [...popups, ...previous.filter(popup => !popups.some(current => current.id === popup.id))]);
    const timers = retained.filter(popup => !currentIds.has(popup.id)).map(popup => {
      const node = nodes.current.get(popup.id);
      const css = node ? getComputedStyle(node) : null;
      const milliseconds = (value: string) => (Number.parseFloat(value) || 0) * (value.trim().endsWith('ms') ? 1 : 1000);
      const durations = css?.animationDuration.split(',').map(milliseconds) ?? [0];
      const delays = css?.animationDelay.split(',').map(milliseconds) ?? [0];
      const duration = Math.max(...durations.map((value,index) => value + (delays[index % delays.length] || 0)));
      return window.setTimeout(() => setRetained(previous => previous.filter(item => item.id !== popup.id)), duration);
    });
    return () => timers.forEach(window.clearTimeout);
    // retained is the committed visual snapshot; only incoming notice changes
    // schedule exits. Animation-end also removes finished snapshots.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popups]);
  return <>{displayed.map(popup => <Transition key={popup.id} show={currentIds.has(popup.id)} preset="dropdown">
    <div
      ref={node => { if (node) nodes.current.set(popup.id,node); else nodes.current.delete(popup.id); }}
      data-finger-popup={popup.id}
      onAnimationEnd={event => {
        if (event.target === event.currentTarget && !currentIds.has(popup.id)) setRetained(previous => previous.filter(item => item.id !== popup.id));
      }}
      className="fixed z-[9999] pointer-events-none px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap backdrop-blur-xl bg-primary/40 dark:bg-primary/20 border-2 border-primary/60 text-white shadow-[0_0_24px_hsl(var(--primary)/0.4)]"
      style={{left:`${popup.x-60}px`,top:`${popup.y-70}px`}}
    >{popup.message}</div>
  </Transition>)}</>;
}
