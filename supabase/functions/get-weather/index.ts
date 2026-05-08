import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

async function geocode(query: string): Promise<any | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    return data?.results?.[0] || null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { location } = await req.json();
    if (!location || typeof location !== 'string') {
      return new Response(JSON.stringify({ error: 'location required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Try multiple variants
    let place: any = null;
    for (const q of buildQueryVariants(location)) {
      place = await geocode(q);
      if (place) break;
    }

    if (!place) {
      // Return 200 with structured error so client doesn't crash
      return new Response(JSON.stringify({
        error: `Could not find location: ${location}`,
        fallback: true,
      }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { latitude, longitude, name, admin1, country_code } = place;
    const displayLocation = [name, admin1, country_code].filter(Boolean).join(', ');

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
