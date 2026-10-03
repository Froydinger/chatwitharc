import { useEffect, useState } from 'react';
import { isIOSDevice, isStandaloneRuntime } from '@/utils/platform';

export const WIDE_NATIVE_QUERY = '(min-width: 640px) and (min-height: 600px)';
export function useWideNativeLayout() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(WIDE_NATIVE_QUERY);
    const update = () => setWide(isIOSDevice() && isStandaloneRuntime() && media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return wide;
}
