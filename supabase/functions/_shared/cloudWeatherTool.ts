import type { CloudToolDefinition } from './cloudRunProvider.ts';
import type { ClaimedCloudRun, RegisteredCloudTool } from './cloudRunWorker.ts';
import type { CloudWeatherData } from './cloudRunArtifacts.ts';

export const CLOUD_WEATHER_DEFINITION: CloudToolDefinition = {
  type: 'function', name: 'get_weather', strict: true,
  description: 'Get weather and an inline weather card for an explicitly requested place. Use coordinates only when supplied by the user or their consented location snapshot. Never infer current location from profile, history, IP, or old coordinates. If current location is unavailable, ask for a place. Cloud execution cannot acquire a fresh device location.',
  parameters: {
    type: 'object', additionalProperties: false,
    properties: { location: { type: ['string', 'null'], maxLength: 300 },
      latitude: { type: ['number', 'null'], minimum: -90, maximum: 90 },
      longitude: { type: ['number', 'null'], minimum: -180, maximum: 180 } },
    required: ['location', 'latitude', 'longitude'],
  },
};

export function cloudWeatherTool(options: {
  authorizeOwner(run: ClaimedCloudRun): Promise<boolean>;
  lookup(body: { location: string | null; latitude: number | null; longitude: number | null }): Promise<unknown>;
}): RegisteredCloudTool {
  return {
    approval: 'never', replaySafe: true, authorize: options.authorizeOwner,
    execute: async (run, call) => {
      let args: Record<string, unknown>;
      try {
        if (call.arguments.length > 4096) throw new Error();
        args = JSON.parse(call.arguments);
        if (!args || Array.isArray(args) || Object.keys(args).sort().join(',') !== 'latitude,location,longitude') throw new Error();
        if (args.location !== null && (typeof args.location !== 'string' || args.location.length > 300)) throw new Error();
        const coordinates = typeof args.latitude === 'number' && Number.isFinite(args.latitude) && Math.abs(args.latitude) <= 90 &&
          typeof args.longitude === 'number' && Number.isFinite(args.longitude) && Math.abs(args.longitude) <= 180;
        const noCoordinates = args.latitude === null && args.longitude === null;
        if (!coordinates && !noCoordinates) throw new Error();
        if (!coordinates && !(typeof args.location === 'string' && args.location.trim())) throw new Error();
      } catch {
        return JSON.stringify({ error: 'Provide an explicit place or valid latitude/longitude pair; use null for unused fields.', performed: false });
      }
      if (!await options.authorizeOwner(run)) return JSON.stringify({ error: 'Weather owner authorization failed.', performed: false });
      let value: unknown;
      try {
        value = await options.lookup(args as { location: string | null; latitude: number | null; longitude: number | null });
      } catch {
        return JSON.stringify({ error: 'Weather lookup unavailable. Do not invent weather conditions.', performed: true });
      }
      if (!value || typeof value !== 'object' || Array.isArray(value)) return JSON.stringify({ error: 'Invalid weather response.' });
      const data = value as Record<string, unknown>;
      const numeric = ['temperature', 'feelsLike', 'code', 'high', 'low', 'humidity', 'wind'] as const;
      if (data.error || typeof data.location !== 'string' || !data.location || data.location.length > 500 ||
        typeof data.condition !== 'string' || data.condition.length > 100 || typeof data.isDay !== 'boolean' ||
        numeric.some(key => typeof data[key] !== 'number' || !Number.isFinite(data[key]))) {
        return JSON.stringify({ error: 'Weather lookup returned incomplete data. Do not invent conditions.' });
      }
      const weather = { location: data.location, condition: data.condition, isDay: data.isDay,
        ...Object.fromEntries(numeric.map(key => [key, data[key]])) } as CloudWeatherData;
      return { output: JSON.stringify({ weather, card: 'Included with the completed reply. Acknowledge briefly; no need to repeat every value.' }),
        presentation: { weather_data: weather } };
    },
  };
}

/** Reuse the existing weather service without altering its voice callers.
 * Service credentials stay in this closure, never in persisted run arguments. */
export function cloudWeatherLookup(url: string, serviceKey: string, fetcher: typeof fetch = fetch) {
  return async (body: { location: string | null; latitude: number | null; longitude: number | null }): Promise<unknown> => {
    const response = await fetcher(`${url.replace(/\/$/, '')}/functions/v1/get-weather`, {
      method: 'POST', headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error('Weather service unavailable'); }
    return await response.json();
  };
}
