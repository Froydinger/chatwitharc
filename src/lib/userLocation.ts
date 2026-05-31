/**
 * User location helper — geolocation + reverse geocode (BigDataCloud free endpoint, no key).
 *
 * Consent model:
 *   - First time location intent is detected, we show an in-app Sonner toast asking
 *     for explicit consent. The browser's native permission prompt only fires after
 *     the user taps "Allow" in our toast.
 *   - Consent decision is persisted in localStorage so we never silently use location.
 *   - Successful lookups are cached in sessionStorage for 30 minutes.
 */

import { toast } from "sonner";

export interface UserLocation {
  city?: string;
  region?: string;
  country?: string;
  latitude: number;
  longitude: number;
  fetchedAt: number;
}

const CACHE_KEY = 'arc:userLocation';
const CONSENT_KEY = 'arc:locationConsent'; // 'granted' | 'denied'
const CACHE_TTL_MS = 30 * 60 * 1000;

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

function getConsent(): 'granted' | 'denied' | null {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === 'granted' || v === 'denied' ? v : null;
  } catch { return null; }
}

function setConsent(v: 'granted' | 'denied') {
  try { localStorage.setItem(CONSENT_KEY, v); } catch {}
}

/** Reset consent so Arc asks again next time location is needed. */
export function resetLocationConsent() {
  try {
    localStorage.removeItem(CONSENT_KEY);
    sessionStorage.removeItem(CACHE_KEY);
  } catch {}
}

/** Show an in-app toast asking the user to allow location for this chat. */
function askConsent(): Promise<boolean> {
  return new Promise((resolve) => {
    let decided = false;
    const id = toast("Share your location with Arc?", {
      description: "It helps with weather, nearby places, and local answers.",
      duration: 15000,
      action: {
        label: "Allow",
        onClick: () => { decided = true; setConsent('granted'); resolve(true); },
      },
      cancel: {
        label: "Not now",
        onClick: () => { decided = true; setConsent('denied'); resolve(false); },
      },
      onDismiss: () => { if (!decided) resolve(false); },
      onAutoClose: () => { if (!decided) resolve(false); },
    });
    void id;
  });
}

async function reverseGeocode(lat: number, lon: number): Promise<Partial<UserLocation>> {
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!res.ok) return {};
    const data = await res.json();
    return {
      city: data.city || data.locality || undefined,
      region: data.principalSubdivision || undefined,
      country: data.countryName || undefined,
    };
  } catch { return {}; }
}

async function readGeolocation(): Promise<GeolocationCoordinates | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos.coords),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setConsent('denied');
        resolve(null);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 }
    );
  });
}

/**
 * Request the user's location. Always shows an in-app consent toast the first
 * time. Returns null if the user declines or geolocation fails.
 */
export async function getUserLocation(): Promise<UserLocation | null> {
  const cached = getCachedLocation();
  if (cached) return cached;

  const consent = getConsent();
  if (consent === 'denied') return null;

  if (consent !== 'granted') {
    const allowed = await askConsent();
    if (!allowed) return null;
  }

  const coords = await readGeolocation();
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
