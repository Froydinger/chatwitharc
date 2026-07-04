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
}

const CACHE_KEY = 'arc:userLocation';
const DENIED_KEY = 'arc:userLocationDenied';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min

// Trigger words/phrases that imply the model would benefit from user location.
const LOCATION_INTENT = /\b(near\s*me|nearby|around\s*(me|here)|in\s*my\s*(area|city|town|region)|where\s*am\s*i|local\b|locally|weather|forecast|temperature|restaurants?|cafes?|coffee|bars?|gas\s*stations?|grocery|grocer(y|ies)|pharmac(y|ies)|hotels?|attractions?|things?\s*to\s*do|what'?s?\s*open|closest|nearest|directions?|how\s*far|distance\s*to|sunset|sunrise|tides?)\b/i;

export function detectsLocationIntent(text: string): boolean {
  if (!text) return false;
  return LOCATION_INTENT.test(text);
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

export function wasLocationDenied(): boolean {
  return sessionStorage.getItem(DENIED_KEY) === '1';
}

async function reverseGeocode(lat: number, lon: number): Promise<Partial<UserLocation>> {
  try {
    let signal: AbortSignal | undefined = undefined;
    if (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal) {
      signal = (AbortSignal as any).timeout(4000);
    }
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
      { signal }
    );
    if (!res.ok) return {};
    const data = await res.json();
    return {
      city: data.city || data.locality || undefined,
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
  if (wasLocationDenied()) return null;
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;

  const coords = await new Promise<GeolocationCoordinates | null>((resolve) => {
    // Manual fallback timeout of 6 seconds to ensure the promise resolves
    // even if the browser/webview geolocation prompt gets stuck.
    const timerId = setTimeout(() => {
      console.warn("Geolocation prompt timed out manually.");
      resolve(null);
    }, 6000);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timerId);
        resolve(pos.coords);
      },
      (err) => {
        clearTimeout(timerId);
        if (err.code === err.PERMISSION_DENIED) {
          try { sessionStorage.setItem(DENIED_KEY, '1'); } catch {}
        }
        resolve(null);
      },
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 5 * 60 * 1000 }
    );
  });

  if (!coords) return null;

  const geo = await reverseGeocode(coords.latitude, coords.longitude);
  const loc: UserLocation = {
    ...geo,
    latitude: Number(coords.latitude.toFixed(4)),
    longitude: Number(coords.longitude.toFixed(4)),
    fetchedAt: Date.now(),
  };
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(loc)); } catch {}
  return loc;
}

export function formatLocationForContext(loc: UserLocation): string {
  const parts = [loc.city, loc.region, loc.country].filter(Boolean);
  const place = parts.length ? parts.join(', ') : `${loc.latitude}, ${loc.longitude}`;
  return `User's current location: ${place} (lat ${loc.latitude}, lon ${loc.longitude}). Use this when relevant to the question.`;
}
