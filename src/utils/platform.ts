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
  if (!isStandaloneRuntime() || isMobileLikeDevice()) return false;

  const isMac = /Macintosh|Mac OS X/i.test(navigator.userAgent) ||
    ((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform === "macOS");
  const isElectron = /electron/i.test(navigator.userAgent);
  if (!isMac && !isElectron) return false;

  const macOSMajor = getReliableMacOSMajorVersion();

  return macOSMajor !== null && macOSMajor <= 26;
}
