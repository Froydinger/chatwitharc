/**
 * User location helper — geolocation + reverse geocode (BigDataCloud free endpoint, no key).
 * Caches per session: location object, denial flag.
 */

export interface UserLocation {
  city?: string;
  region?: string;
  country?: string;
  latitude: number;
  longitude: number;
  fetchedAt: number;
  accuracyMeters?: number;
}

// Versioned so previously cached coarse/IP-derived locations are discarded.
const CACHE_KEY = 'arc:userLocation:v2';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min
let pendingLocationRequest: Promise<UserLocation | null> | null = null;

// Trigger words/phrases that imply the model would benefit from user location.
const LOCATION_INTENT = /\b(near\s*me|nearby|around\s*(me|here)|in\s*my\s*(area|city|town|region)|where\s*am\s*i|local\b|locally|weather|forecast|temperature|restaurants?|cafes?|coffee|bars?|gas\s*stations?|grocery|grocer(y|ies)|pharmac(y|ies)|hotels?|attractions?|things?\s*to\s*do|what'?s?\s*open|closest|nearest|directions?|how\s*far|distance\s*to|sunset|sunrise|tides?)\b/i;
const CURRENT_LOCATION_INTENT = /\b(near\s*me|nearby|around\s*(me|here)|in\s*my\s*(area|city|town|region)|where\s*am\s*i|my\s*(location|area|city|town|region)|current\s*location|(closest|nearest)\s+to\s+me)\b/i;

export function detectsLocationIntent(text: string): boolean {
  if (!text) return false;
  return LOCATION_INTENT.test(text);
}

export function requestsCurrentLocation(text: string): boolean {
  if (!text) return false;
  return CURRENT_LOCATION_INTENT.test(text);
}

export function getCachedLocation(): UserLocation | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const loc = JSON.parse(raw) as UserLocation;
    if (Date.now() - loc.fetchedAt > CACHE_TTL_MS) return null;
    return loc;
  } catch {
    return null;
  }
}

async function reverseGeocode(lat: number, lon: number): Promise<Partial<UserLocation>> {
  try {
    const fetchPromise = fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`
    );

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), 4000)
    );

    const res = await Promise.race([fetchPromise, timeoutPromise]);
    if (!res.ok) return {};
    const data = await res.json();
    return {
      city: data.locality || data.city || undefined,
      region: data.principalSubdivision || undefined,
      country: data.countryName || undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Request geolocation from the browser. Returns null if unavailable, denied,
 * or previously denied this session. Caches successful results in sessionStorage.
 */
export async function getUserLocation(): Promise<UserLocation | null> {
  const cached = getCachedLocation();
  if (cached) return cached;
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
  if (pendingLocationRequest) return pendingLocationRequest;

  pendingLocationRequest = (async () => {
    const requestCoordinates = (enableHighAccuracy: boolean) => new Promise<{
      coords: GeolocationCoordinates | null;
      errorCode?: number;
    }>((resolve) => {
      // Give iOS enough time to present and resolve its native permission sheet.
      const timerId = setTimeout(() => {
        console.warn("Geolocation prompt timed out manually.");
        resolve({ coords: null });
      }, 15_000);

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(timerId);
          resolve({ coords: pos.coords });
        },
        (error) => {
          clearTimeout(timerId);
          // Do not cache denial here. iOS and embedded browsers can return the
          // same code when no permission sheet was shown; the browser already
          // remembers a genuine user denial itself.
          resolve({ coords: null, errorCode: error.code });
        },
        { enableHighAccuracy, timeout: 12_000, maximumAge: 0 }
      );
    });

    // Retry transient iOS/provider failures once with lower accuracy. A real
    // permission denial can only be changed by the user in OS settings.
    let result = await requestCoordinates(true);
    if (!result.coords && result.errorCode !== 1) {
      result = await requestCoordinates(false);
    }
    const coords = result.coords;

    if (!coords) return null;

    const geo = await reverseGeocode(coords.latitude, coords.longitude);
    const loc: UserLocation = {
      ...geo,
      latitude: Number(coords.latitude.toFixed(4)),
      longitude: Number(coords.longitude.toFixed(4)),
      fetchedAt: Date.now(),
      accuracyMeters: Math.round(coords.accuracy),
    };
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(loc)); } catch {}
    return loc;
  })();

  try {
    return await pendingLocationRequest;
  } finally {
    pendingLocationRequest = null;
  }
}

export function formatLocationForContext(loc: UserLocation): string {
  const parts = [loc.city, loc.region, loc.country].filter(Boolean);
  const place = parts.length ? parts.join(', ') : `${loc.latitude}, ${loc.longitude}`;
  return `Browser-reported location: ${place} (lat ${loc.latitude}, lon ${loc.longitude}). The user's explicitly stated location always overrides this value. Use it only when relevant.`;
}
