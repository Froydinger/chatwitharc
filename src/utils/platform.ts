export function isStandaloneRuntime(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
    /electron/i.test(navigator.userAgent)
  );
}

export function isMobileLikeDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1)
  );
}

function getMacOSMajorVersion(): number | null {
  if (typeof navigator === "undefined") return null;

  const uaData = (navigator as Navigator & {
    userAgentData?: { platform?: string; platformVersion?: string };
  }).userAgentData;

  if (uaData?.platform === "macOS" && uaData.platformVersion) {
    const major = Number.parseInt(uaData.platformVersion.split(".")[0] || "", 10);
    if (Number.isFinite(major)) return major;
  }

  const uaMatch = navigator.userAgent.match(/Mac OS X\s+(\d+)[_.](\d+)/i);
  if (!uaMatch) return null;

  const major = Number.parseInt(uaMatch[1] || "", 10);
  const minor = Number.parseInt(uaMatch[2] || "", 10);
  if (!Number.isFinite(major)) return null;

  // Safari often reports old "10_x" style versions. Sonoma 14 maps from 10_14,
  // Sequoia 15 from 10_15, and so on.
  if (major === 10 && Number.isFinite(minor) && minor >= 14) return minor;
  return major;
}

export function shouldReserveDesktopTrafficLightSpace(): boolean {
  if (!isStandaloneRuntime() || isMobileLikeDevice()) return false;

  const isMac = /Macintosh|Mac OS X/i.test(navigator.userAgent) ||
    ((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform === "macOS");
  const isElectron = /electron/i.test(navigator.userAgent);
  if (!isMac && !isElectron) return false;

  const macOSMajor = getMacOSMajorVersion();
  if (macOSMajor === null) return true;

  return macOSMajor <= 26;
}
