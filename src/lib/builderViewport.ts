export const APP_BUILDER_DESKTOP_MIN_WIDTH = 768;

export interface AppBuilderDeviceProfile {
  viewportWidth: number;
  userAgent: string;
  maxTouchPoints: number;
  screenWidth: number;
  screenHeight: number;
  coarsePointer: boolean;
  mobileHint?: boolean;
  nativePlatform?: string | null;
  nativeIOSClass?: boolean;
}

/**
 * App Builder is a desktop workflow. User-agent and physical-screen signals
 * cover phones that request a desktop site, while wide desktop viewports remain
 * usable with ordinary touchscreen displays.
 */
export function canUseAppBuilderOnDesktop(profile: AppBuilderDeviceProfile): boolean {
  if (profile.viewportWidth < APP_BUILDER_DESKTOP_MIN_WIDTH) return false;
  if (profile.nativeIOSClass || profile.nativePlatform) return false;
  if (profile.mobileHint) return false;
  if (/iPhone|iPad|iPod|Android|Mobile|Tablet|Windows Phone/i.test(profile.userAgent)) return false;

  const touchFirstSmallScreen = profile.maxTouchPoints > 1
    && Math.min(profile.screenWidth, profile.screenHeight) < 700;
  const iPadDesktopUserAgent = /Macintosh|Mac OS X/i.test(profile.userAgent)
    && profile.maxTouchPoints > 1;
  const coarsePointerSmallScreen = profile.coarsePointer
    && profile.maxTouchPoints > 0
    && Math.min(profile.screenWidth, profile.screenHeight) < 700;

  return !touchFirstSmallScreen && !iPadDesktopUserAgent && !coarsePointerSmallScreen;
}

export function isAppBuilderDesktopAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  const nativeWindow = window as Window & {
    Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
  };
  const userAgentData = (window.navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  const nativePlatform = nativeWindow.Capacitor?.isNativePlatform?.()
    ? nativeWindow.Capacitor.getPlatform?.() ?? 'native'
    : null;
  return canUseAppBuilderOnDesktop({
    viewportWidth: window.innerWidth,
    userAgent: window.navigator.userAgent,
    maxTouchPoints: window.navigator.maxTouchPoints,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    mobileHint: userAgentData?.mobile === true,
    nativePlatform,
    nativeIOSClass: document.body.classList.contains('arc-native-ios'),
  });
}
