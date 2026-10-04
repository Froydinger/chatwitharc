import type { Config, Context } from "@netlify/edge-functions";

const responseHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "600",
  "Cache-Control": "no-store, max-age=0",
  "Content-Type": "application/json; charset=utf-8",
  "Pragma": "no-cache",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

function cleanLabel(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim();
  return cleaned ? cleaned.slice(0, 100) : undefined;
}

function roundedCoordinate(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) return null;
  return Number(value.toFixed(2));
}

export default async function locationHandler(request: Request, context: Context): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: responseHeaders });
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const geo = context.geo;
  const city = cleanLabel(geo?.city);
  const latitude = roundedCoordinate(geo?.latitude, -90, 90);
  const longitude = roundedCoordinate(geo?.longitude, -180, 180);

  if (!city || latitude === null || longitude === null) return jsonResponse({ location: null });

  const region = cleanLabel(geo?.subdivision?.name);
  const country = cleanLabel(geo?.country?.name);

  return jsonResponse({
    location: {
      city,
      ...(region ? { region } : {}),
      ...(country ? { country } : {}),
      latitude,
      longitude,
      source: "ip",
    },
  });
}

export const config: Config = {
  path: "/api/location",
};
