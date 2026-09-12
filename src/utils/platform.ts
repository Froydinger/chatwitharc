export function isStandaloneRuntime(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
    /electron/i.test(navigator.userAgent)
  );
}

export function isMobileLikeDevice(): boolean {
  if (typeof navigator === "undefined" || !navigator.userAgent) return false;
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1)
  );
}

export function isIOSDevice(): boolean {
  if (typeof navigator === "undefined" || !navigator.userAgent) return false;
  return (
    /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1)
  );
}

export function isIOSPWA(): boolean {
  if (typeof window === "undefined") return false;
  return (
    isIOSDevice() &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}

/**
 * Returns audio constraints tailored to the platform.
 *
 * For iOS (WebKit / PWA):
 * - Omits sampleRate and channelCount overrides because WebKit can bypass hardware AEC
 *   when custom sample rates or channels are requested.
 * - Disables autoGainControl to prevent iOS hardware AGC from pumping microphone gain during
 *   assistant speech and sucking loudspeaker bleed into the input.
 *
 * For Desktop:
 * - Keeps standard full-duplex desktop constraints (48kHz, mono, AGC on).
 */
export function getVoiceAudioConstraints(): MediaTrackConstraints {
  if (isIOSDevice()) {
    return {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: false,
    };
  }

  return {
    channelCount: { ideal: 1 },
    sampleRate: { ideal: 48000 },
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };
}

export function isMacDesktopRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const bridge = (window as Window & {
    arcaiDesktop?: { platform?: string };
  }).arcaiDesktop;
  return /electron/i.test(navigator.userAgent) && bridge?.platform === "darwin";
}

/**
 * True for a regular macOS desktop browser, but false for the Electron app
 * and installed standalone/PWA windows.
 */
export function isMacDesktopBrowser(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  if (isMobileLikeDevice() || isStandaloneRuntime()) return false;

  const userAgentData = (navigator as Navigator & {
    userAgentData?: { platform?: string };
  }).userAgentData;

  return /Macintosh|Mac OS X/i.test(navigator.userAgent) || userAgentData?.platform === "macOS";
}

function getReliableMacOSMajorVersion(): number | null {
  if (typeof navigator === "undefined") return null;

  const uaData = (navigator as Navigator & {
    userAgentData?: { platform?: string; platformVersion?: string };
  }).userAgentData;

  if (uaData?.platform === "macOS" && uaData.platformVersion) {
    const major = Number.parseInt(uaData.platformVersion.split(".")[0] || "", 10);
    if (Number.isFinite(major)) return major;
  }

  const uaMatch = navigator.userAgent.match(/Mac OS X\s+([2-9]\d)[_.]/i);
  if (!uaMatch) return null;

  const major = Number.parseInt(uaMatch[1] || "", 10);
  if (!Number.isFinite(major)) return null;

  // Modern Safari can still report a frozen "10_15" UA on much newer macOS.
  // Only trust explicit 20+ major versions here; otherwise leave spacing off.
  return major;
}

export function shouldReserveDesktopTrafficLightSpace(): boolean {
  // Never touch mobile devices (iOS, Android, iPad, etc.)
  if (isMobileLikeDevice()) return false;

  if (typeof window !== "undefined") {
    const isFloating = window.location.search.includes("floating=1") ||
      (window as Window & { arcaiDesktop?: { isFloating?: boolean } }).arcaiDesktop?.isFloating === true;
    if (isFloating) return false;
  }

  const isMac = typeof navigator !== "undefined" && (
    /Macintosh|Mac OS X/i.test(navigator.userAgent) ||
    ((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform === "macOS")
  );
  const isElectron = typeof navigator !== "undefined" && /electron/i.test(navigator.userAgent);

  // Desktop BROWSER (regular tabs in Chrome, Safari, Firefox, Breeze, etc.) does NOT need traffic light space.
  // Traffic light space is ONLY needed when running as:
  // 1) The Mac desktop app (Electron)
  // 2) The installed Mac Web App (PWA in standalone mode)
  if (!isStandaloneRuntime()) {
    return false;
  }

  // When running in standalone mode (PWA or Electron), reserve space for macOS window controls
  return isMac || isElectron;
}
