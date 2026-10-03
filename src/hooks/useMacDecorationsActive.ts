import { useEffect, useState } from 'react';

export function isInstalledMacArc(userAgent: string) {
  return /Macintosh/i.test(userAgent) && /ArcAIInternalAuth\//i.test(userAgent);
}

/** Non-Mac platforms keep their existing decoration behavior. */
export function subscribeMacDecorations(
  targetWindow: Pick<Window, 'addEventListener' | 'removeEventListener'>,
  targetDocument: Pick<Document, 'addEventListener' | 'removeEventListener' | 'hidden' | 'hasFocus'>,
  installedMac: boolean,
  update: (active: boolean) => void,
) {
  if (!installedMac) { update(true); return () => {}; }
  const sync = () => update(!targetDocument.hidden && targetDocument.hasFocus());
  targetWindow.addEventListener('focus', sync);
  targetWindow.addEventListener('blur', sync);
  targetDocument.addEventListener('visibilitychange', sync);
  sync();
  return () => {
    targetWindow.removeEventListener('focus', sync);
    targetWindow.removeEventListener('blur', sync);
    targetDocument.removeEventListener('visibilitychange', sync);
  };
}

export function useMacDecorationsActive() {
  const [active, setActive] = useState(() => typeof window === 'undefined'
    || !isInstalledMacArc(window.navigator.userAgent)
    || (!document.hidden && document.hasFocus()));
  useEffect(() => subscribeMacDecorations(window, document,
    isInstalledMacArc(window.navigator.userAgent), setActive), []);
  return active;
}
