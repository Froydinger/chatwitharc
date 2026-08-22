const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.google.internal.",
]);

function isBlockedIpv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) {
    return false;
  }
  const octets = parts.map(Number);
  if (octets.some((part) => part > 255)) return true;
  const [a, b] = octets;
  return a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224;
}

function isBlockedIpv6(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host.includes(":")) return false;
  return host === "::" || host === "::1" || host.startsWith("fc") ||
    host.startsWith("fd") ||
    /^fe[89ab]/.test(host) || host.startsWith("ff") ||
    host.startsWith("::ffff:127.") || host.startsWith("::ffff:10.") ||
    host.startsWith("::ffff:192.168.");
}

function validateRemoteUrl(rawUrl: string): URL {
  const url = new URL(rawUrl);
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== "https:") throw new Error("Source image must use HTTPS");
  if (url.username || url.password) {
    throw new Error("Source image URL may not contain credentials");
  }
  if (
    BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    throw new Error("Source image host is not allowed");
  }
  if (isBlockedIpv4(hostname) || isBlockedIpv6(hostname)) {
    throw new Error("Source image host is not allowed");
  }
  return url;
}

async function readLimited(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error("Source image is too large");
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maxBytes) {
      await reader.cancel();
      throw new Error("Source image is too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function fetchPublicMedia(
  rawUrl: string,
  options: { maxBytes?: number; timeoutMs?: number; maxRedirects?: number } =
    {},
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const maxBytes = options.maxBytes ?? 25 * 1024 * 1024;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxRedirects = options.maxRedirects ?? 3;
  let currentUrl = validateRemoteUrl(rawUrl);

  for (let redirects = 0; redirects <= maxRedirects; redirects++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(currentUrl, {
        redirect: "manual",
        signal: controller.signal,
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirects === maxRedirects) {
          throw new Error("Too many source image redirects");
        }
        currentUrl = validateRemoteUrl(
          new URL(location, currentUrl).toString(),
        );
        continue;
      }
      if (!response.ok) {
        throw new Error(`Failed to fetch source image: ${response.status}`);
      }
      return {
        bytes: await readLimited(response, maxBytes),
        contentType: response.headers.get("content-type") ||
          "application/octet-stream",
      };
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("Too many source image redirects");
}
