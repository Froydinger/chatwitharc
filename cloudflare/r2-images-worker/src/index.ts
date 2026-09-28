interface Env {
  IMAGES: R2Bucket;
  ARC_IMAGE_SECRET: string;
}

const PUBLIC_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "X-Content-Type-Options": "nosniff",
};

function isAuthorized(request: Request, env: Env): boolean {
  return request.headers.get("Authorization") === `Bearer ${env.ARC_IMAGE_SECRET}`;
}

function objectKey(url: URL): string | null {
  const prefix = "/objects/";
  if (!url.pathname.startsWith(prefix)) return null;
  const key = url.pathname.slice(prefix.length);
  if (!key) return null;
  try {
    const parts = key.split("/").map(decodeURIComponent);
    if (parts.some((part) => !part || part === "." || part === ".." || part.includes("/") || part.includes("\\"))) return null;
    return parts.join("/");
  } catch {
    return null;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ ok: true, storage: "r2" }, { headers: PUBLIC_HEADERS });
    }

    if (url.pathname === "/admin/list") {
      if (!isAuthorized(request, env)) return new Response("Unauthorized", { status: 401, headers: PUBLIC_HEADERS });
      if (request.method !== "GET") {
        return new Response("Method not allowed", { status: 405, headers: { ...PUBLIC_HEADERS, "Allow": "GET" } });
      }
      const requestedLimit = Number(url.searchParams.get("limit") ?? 1000);
      const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(1000, Math.floor(requestedLimit))) : 1000;
      const cursor = url.searchParams.get("cursor") ?? undefined;
      const result = await env.IMAGES.list({ limit, cursor, include: ["httpMetadata"] });
      return Response.json({
        objects: result.objects.map((object) => ({
          key: object.key,
          size: object.size,
          uploaded: object.uploaded.toISOString(),
          contentType: object.httpMetadata?.contentType ?? null,
        })),
        truncated: result.truncated,
        cursor: result.truncated ? result.cursor : null,
      }, { headers: PUBLIC_HEADERS });
    }

    const key = objectKey(url);
    if (!key) return new Response("Not found", { status: 404, headers: PUBLIC_HEADERS });

    if (request.method === "GET" || request.method === "HEAD") {
      const object = request.method === "HEAD" ? await env.IMAGES.head(key) : await env.IMAGES.get(key);
      if (!object) return new Response("Not found", { status: 404, headers: PUBLIC_HEADERS });
      const headers = new Headers(PUBLIC_HEADERS);
      object.writeHttpMetadata(headers);
      headers.set("etag", object.httpEtag);
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
      return new Response(request.method === "HEAD" || !("body" in object) ? null : object.body, { headers });
    }

    if (!isAuthorized(request, env)) return new Response("Unauthorized", { status: 401, headers: PUBLIC_HEADERS });

    if (request.method === "PUT") {
      if (!request.body) return new Response("Body required", { status: 400 });
      const contentType = request.headers.get("Content-Type") || "application/octet-stream";
      await env.IMAGES.put(key, request.body, {
        httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" },
      });
      return Response.json({ success: true, key });
    }

    if (request.method === "DELETE") {
      await env.IMAGES.delete(key);
      return Response.json({ success: true });
    }

    return new Response("Method not allowed", {
      status: 405,
      headers: { ...PUBLIC_HEADERS, "Allow": "GET, HEAD, PUT, DELETE" },
    });
  },
} satisfies ExportedHandler<Env>;
