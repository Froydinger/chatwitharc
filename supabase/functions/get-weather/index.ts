import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const US_STATES: Record<string, string> = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',
  FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',
  LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',
  MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',
  ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',
  TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',DC:'District of Columbia'
};

const CODE_LABELS: Record<number, string> = {
  0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Foggy', 48: 'Foggy',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
  66: 'Freezing rain', 67: 'Freezing rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Rain showers', 81: 'Rain showers', 82: 'Heavy rain showers',
  85: 'Snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with hail',
};

// Try multiple query variants since Open-Meteo geocoder is picky
function buildQueryVariants(raw: string): string[] {
  const cleaned = raw.trim();
  const variants = new Set<string>();
  variants.add(cleaned);

  // Strip US ZIP codes (5 or 5-4)
  const noZip = cleaned.replace(/\b\d{5}(-\d{4})?\b/g, '').replace(/,\s*,/g, ',').replace(/,\s*$/, '').trim();
  if (noZip) variants.add(noZip);

  // First comma segment (e.g. "Oak Forest, IL" -> "Oak Forest")
  const firstPart = noZip.split(',')[0]?.trim();
  if (firstPart) variants.add(firstPart);

  return Array.from(variants).filter(Boolean);
}

// Extract state hint (full name or 2-letter code) from query
function extractStateHint(raw: string): string | null {
  const parts = raw.split(',').map(p => p.trim()).filter(Boolean);
  for (const p of parts) {
    const upper = p.toUpperCase().replace(/\./g, '');
    if (US_STATES[upper]) return US_STATES[upper];
    const match = Object.values(US_STATES).find(s => s.toLowerCase() === p.toLowerCase());
    if (match) return match;
  }
  // Also check inline tokens like "Plainfield IL"
  const tokens = raw.replace(/[,.]/g, ' ').split(/\s+/).filter(Boolean);
  for (const t of tokens) {
    const upper = t.toUpperCase();
    if (upper.length === 2 && US_STATES[upper]) return US_STATES[upper];
  }
  return null;
}

async function geocode(query: string, stateHint: string | null): Promise<any | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=10&language=en&format=json`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    const results: any[] = data?.results || [];
    if (results.length === 0) return null;
    if (stateHint) {
      const matched = results.find(r => (r.admin1 || '').toLowerCase() === stateHint.toLowerCase());
      if (matched) return matched;
    }
    return results[0];
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { location, latitude: latIn, longitude: lonIn } = body || {};

    let latitude: number | null = null;
    let longitude: number | null = null;
    let displayLocation = '';

    // Prefer precise coordinates when provided (skips geocoding entirely)
    if (typeof latIn === 'number' && typeof lonIn === 'number' && isFinite(latIn) && isFinite(lonIn)) {
      latitude = latIn;
      longitude = lonIn;
      // Reverse-geocode for a friendly label, but never block on it
      try {
        const rg = await fetch(
          `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${latitude}&longitude=${longitude}&language=en&format=json`
        );
        const rgData = await rg.json();
        const r = rgData?.results?.[0];
        if (r) displayLocation = [r.name, r.admin1, r.country_code].filter(Boolean).join(', ');
      } catch {}
      if (!displayLocation && typeof location === 'string') displayLocation = location;
      if (!displayLocation) displayLocation = `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;
    } else {
      if (!location || typeof location !== 'string') {
        return new Response(JSON.stringify({ error: 'location or latitude/longitude required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const stateHint = extractStateHint(location);
      let place: any = null;
      for (const q of buildQueryVariants(location)) {
        place = await geocode(q, stateHint);
        if (place) break;
      }

      if (!place) {
        return new Response(JSON.stringify({
          error: `Could not find location: ${location}`,
          fallback: true,
        }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      latitude = place.latitude;
      longitude = place.longitude;
      displayLocation = [place.name, place.admin1, place.country_code].filter(Boolean).join(', ');
    }


    const wxUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      `&current=temperature_2m,apparent_temperature,is_day,relative_humidity_2m,weather_code,wind_speed_10m` +
      `&daily=temperature_2m_max,temperature_2m_min` +
      `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`;
    const wxRes = await fetch(wxUrl);
    const wx = await wxRes.json();

    const current = wx.current || {};
    const daily = wx.daily || {};
    const code = current.weather_code ?? 0;

    return new Response(JSON.stringify({
      location: displayLocation,
      temperature: Math.round(current.temperature_2m ?? 0),
      feelsLike: Math.round(current.apparent_temperature ?? 0),
      condition: CODE_LABELS[code] || 'Unknown',
      code,
      high: Math.round(daily.temperature_2m_max?.[0] ?? 0),
      low: Math.round(daily.temperature_2m_min?.[0] ?? 0),
      humidity: Math.round(current.relative_humidity_2m ?? 0),
      wind: Math.round(current.wind_speed_10m ?? 0),
      isDay: current.is_day === 1,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('get-weather error:', e);
    return new Response(JSON.stringify({ error: e?.message || 'Weather lookup failed', fallback: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
