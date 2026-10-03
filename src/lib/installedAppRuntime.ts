export interface InstalledAppSignals {
  userAgent: string;
  standalone: boolean;
  native: boolean;
  desktopShell: boolean;
  androidSource: string | null;
}
export function matchesInstalledApp(signals: InstalledAppSignals): boolean {
  return signals.native || signals.standalone || signals.desktopShell
    || /Electron|ArcAIInternalAuth\//i.test(signals.userAgent)
    || (/Android/i.test(signals.userAgent) && ['android-direct', 'android-play'].includes(signals.androidSource ?? ''));
}
export function isInstalledAppRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  const source = new URLSearchParams(window.location.search).get('source');
  let androidSource = source;
  try {
    if (/Android/i.test(ua) && ['android-direct', 'android-play'].includes(source ?? '')) {
      window.sessionStorage.setItem('arcai-installed-android-source', source!);
    }
    androidSource ||= window.sessionStorage.getItem('arcai-installed-android-source');
  } catch { /* The initial launch marker still works without storage. */ }
  const nativeWindow = window as Window & {
    Capacitor?: { isNativePlatform?: () => boolean };
    arcaiDesktop?: unknown;
  };
  return matchesInstalledApp({
    userAgent: ua,
    standalone: ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay'].some(mode => window.matchMedia(`(display-mode: ${mode})`).matches)
      || (window.navigator as Navigator & { standalone?: boolean }).standalone === true,
    native: nativeWindow.Capacitor?.isNativePlatform?.() === true || document.body.classList.contains('arc-native-ios'),
    desktopShell: !!nativeWindow.arcaiDesktop,
    androidSource,
  });
}
