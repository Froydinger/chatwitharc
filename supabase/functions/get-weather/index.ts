import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Open-Meteo WMO weather codes -> human label
const CODE_LABELS: Record<number, string> = {
  0: 'Clear',
  1: 'Mostly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Foggy',
  48: 'Foggy',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  66: 'Freezing rain',
  67: 'Freezing rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Rain showers',
  81: 'Rain showers',
  82: 'Heavy rain showers',
  85: 'Snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Thunderstorm with hail',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { location } = await req.json();
    if (!location || typeof location !== 'string') {
      return new Response(JSON.stringify({ error: 'location required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Geocode
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`;
    const geoRes = await fetch(geoUrl);
    const geo = await geoRes.json();
    const place = geo?.results?.[0];
    if (!place) {
      return new Response(JSON.stringify({ error: `Could not find location: ${location}` }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { latitude, longitude, name, admin1, country_code } = place;
    const displayLocation = [name, admin1, country_code].filter(Boolean).join(', ');

    // 2. Current weather (imperial — US-friendly)
    const wxUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      `&current=temperature_2m,apparent_temperature,is_day,relative_humidity_2m,weather_code,wind_speed_10m` +
      `&daily=temperature_2m_max,temperature_2m_min` +
      `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`;
    const wxRes = await fetch(wxUrl);
    const wx = await wxRes.json();

    const current = wx.current || {};
    const daily = wx.daily || {};
    const code = current.weather_code ?? 0;
    const condition = CODE_LABELS[code] || 'Unknown';

    const result = {
      location: displayLocation,
      temperature: Math.round(current.temperature_2m ?? 0),
      feelsLike: Math.round(current.apparent_temperature ?? 0),
      condition,
      code,
      high: Math.round(daily.temperature_2m_max?.[0] ?? 0),
      low: Math.round(daily.temperature_2m_min?.[0] ?? 0),
      humidity: Math.round(current.relative_humidity_2m ?? 0),
      wind: Math.round(current.wind_speed_10m ?? 0),
      isDay: current.is_day === 1,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('get-weather error:', e);
    return new Response(JSON.stringify({ error: e?.message || 'Weather lookup failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
