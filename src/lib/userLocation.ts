/** Approximate network location; never requests GPS or device permission. */
export interface UserLocation {
  city?: string;
  region?: string;
  country?: string;
  latitude: number;
  longitude: number;
  fetchedAt: number;
  accuracyMeters?: number;
  source: 'ip';
}

const CACHE_KEY = 'arc:userLocation:ip:v3';
const CACHE_TTL_MS = 30 * 60 * 1000;
const FAILURE_TTL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 1_500;
let failedAt: number | null = null;
let pendingLocationRequest: Promise<UserLocation | null> | null = null;

const LOCATION_INTENT = /\b(near\s*me|nearby|around\s*(me|here)|in\s*my\s*(area|city|town|region)|where\s*am\s*i|local\b|locally|weather|forecast|temperature|restaurants?|cafes?|coffee|bars?|gas\s*stations?|grocery|grocer(y|ies)|pharmac(y|ies)|hotels?|attractions?|things?\s*to\s*do|what'?s?\s*open|closest|nearest|directions?|how\s*far|distance\s*to|sunset|sunrise|tides?)\b/i;
const CURRENT_LOCATION_INTENT = /\b(near\s*me|nearby|around\s*(me|here)|in\s*my\s*(area|city|town|region)|where\s*am\s*i|my\s*(location|area|city|town|region)|current\s*location|(closest|nearest)\s+to\s+me)\b/i;
export function detectsLocationIntent(text: string): boolean { return !!text && LOCATION_INTENT.test(text); }
export function requestsCurrentLocation(text: string): boolean { return !!text && CURRENT_LOCATION_INTENT.test(text); }

function validLocation(value: unknown): value is UserLocation {
  if (!value || typeof value !== 'object') return false;
  const loc = value as UserLocation;
  return loc.source === 'ip' && typeof loc.city === 'string' && !!loc.city.trim() &&
    Number.isFinite(loc.latitude) && Math.abs(loc.latitude) <= 90 &&
    Number.isFinite(loc.longitude) && Math.abs(loc.longitude) <= 180 &&
    Number.isFinite(loc.fetchedAt) && loc.fetchedAt <= Date.now() &&
    Date.now() - loc.fetchedAt <= CACHE_TTL_MS;
}
export function getCachedLocation(): UserLocation | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    const loc: unknown = raw ? JSON.parse(raw) : null;
    return validLocation(loc) ? loc : null;
  } catch { return null; }
}

/** One bounded request shared by chat, Work and voice, including installed apps. */
export async function getUserLocation(): Promise<UserLocation | null> {
  const cached = getCachedLocation();
  if (cached) return cached;
  if (failedAt !== null && Date.now() - failedAt < FAILURE_TTL_MS) return null;
  if (pendingLocationRequest) return pendingLocationRequest;
  pendingLocationRequest = (async () => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // Fixed first-party origin works from native capacitor:// and web wrappers.
      // The edge uses the caller's IP; no IP or precise position leaves this helper.
      const request = (async () => {
        const response = await fetch('https://askarc.chat/api/location', {
          signal: controller.signal, credentials: 'omit', cache: 'no-store',
        });
        if (!response.ok) return null;
        const data = await response.json();
        const location: unknown = data?.location ? { ...data.location, fetchedAt: Date.now() } : null;
        return validLocation(location) ? location : null;
      })();
      const timeout = new Promise<null>((resolve) => {
        timer = setTimeout(() => { controller.abort(); resolve(null); }, REQUEST_TIMEOUT_MS);
      });
      const loc = await Promise.race([request, timeout]);
      if (!loc) { failedAt = Date.now(); return null; }
      failedAt = null;
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(loc)); } catch { /* Storage is optional. */ }
      return loc;
    } catch { failedAt = Date.now(); return null; }
    finally { if (timer !== undefined) clearTimeout(timer); }
  })();
  try { return await pendingLocationRequest; }
  finally { pendingLocationRequest = null; }
}

export function formatLocationForContext(loc: UserLocation): string {
  const place = [loc.city, loc.region, loc.country].filter(Boolean).join(', ');
  return `Approximate IP-based city: ${place} (city-area latitude ${loc.latitude}, longitude ${loc.longitude}). This is a network estimate, not GPS or an exact device location; VPNs and mobile networks can place it in another city. The user's explicitly stated city or location always overrides this estimate. Use it only when relevant. For nearby results identify the estimated city and let the user correct it; never claim exact distance or precise current location.`;
}
