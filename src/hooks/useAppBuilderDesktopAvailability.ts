import { useEffect, useState } from 'react';
import { isAppBuilderDesktopAvailable } from '@/lib/builderViewport';

/** Keep Builder eligibility in sync with viewport, orientation, pointer, and native-shell changes. */
export function useAppBuilderDesktopAvailability() {
  const [available, setAvailable] = useState(isAppBuilderDesktopAvailable);

  useEffect(() => {
    const update = () => setAvailable(isAppBuilderDesktopAvailable());
    const coarsePointer = window.matchMedia('(pointer: coarse)');
    const observer = new MutationObserver(update);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    window.visualViewport?.addEventListener('resize', update);
    coarsePointer.addEventListener('change', update);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      window.visualViewport?.removeEventListener('resize', update);
      coarsePointer.removeEventListener('change', update);
    };
  }, []);

  return available;
}
