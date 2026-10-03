const TRUSTED_ORIGINS = new Set([
  "https://askarc.chat",
  "https://chatwitharc.com",
  "https://www.chatwitharc.com",
]);

const DESKTOP_AUTH_PORT = 48879;
const DESKTOP_AUTH_NONCE_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const SUPABASE_AUTH_HOSTS = new Set([
  "auth.askarc.chat",
  "jpqtoixhjnfdubvqshwk.supabase.co",
]);

function getTrustedCallback(value) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !TRUSTED_ORIGINS.has(url.origin) ||
      !["/auth/callback", "/desktop-auth-callback"].includes(url.pathname)
    ) {
      return null;
    }

    const returnOrigin = url.searchParams.get("return_origin");
    if (returnOrigin && new URL(returnOrigin).origin !== url.origin) return null;

    const port = url.searchParams.get("port");
    if (url.pathname === "/desktop-auth-callback" && port && port !== String(DESKTOP_AUTH_PORT)) {
      return null;
    }

    return url;
  } catch (_) {
    return null;
  }
}

function isDesktopAuthCallback(value) {
  const url = getTrustedCallback(value);
  return Boolean(url && url.pathname === "/desktop-auth-callback");
}

function getDesktopAuthCallbackFromRequest(requestTarget, host) {
  if (host !== `127.0.0.1:${DESKTOP_AUTH_PORT}`) return null;
  try {
    const requestUrl = new URL(requestTarget, `http://${host}`);
    const href = requestUrl.searchParams.get("href");
    const nonce = requestUrl.searchParams.get("nonce");
    if (requestUrl.pathname !== "/auth-callback" || !href || !nonce || !DESKTOP_AUTH_NONCE_PATTERN.test(nonce)) return null;
    const callback = getTrustedCallback(href);
    if (
      !callback ||
      callback.pathname !== "/desktop-auth-callback" ||
      callback.searchParams.get("bridge_nonce") !== nonce ||
      callback.searchParams.get("transport") !== "loopback-get"
    ) return null;
    return { href, nonce };
  } catch (_) {
    return null;
  }
}

function getAppAuthCallbackUrl(value, appOrigin = "https://askarc.chat") {
  let fallback;
  try {
    fallback = new URL(appOrigin).origin;
  } catch (_) {
    fallback = "https://askarc.chat";
  }
  if (!isDesktopAuthCallback(value)) return fallback;

  try {
    const source = new URL(value);
    const target = new URL("/auth/callback", fallback);
    // The one-time PKCE code is returned to the same Electron session that
    // holds the verifier in its Supabase localStorage.
    for (const key of ["code", "error", "error_code", "error_description"]) {
      const value = source.searchParams.get(key);
      if (value) target.searchParams.set(key, value);
    }
    target.hash = source.hash;
    return target.toString();
  } catch (_) {
    return fallback;
  }
}

/**
 * Return a validated Google OAuth URL with its callback redirected through
 * ArcAI's existing loopback bridge. Non-Google and untrusted URLs return null.
 */
function getSafariGoogleOAuthUrl(value, bridgeNonce) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !SUPABASE_AUTH_HOSTS.has(url.hostname.toLowerCase()) ||
      url.pathname !== "/auth/v1/authorize" ||
      url.searchParams.get("provider") !== "google"
    ) {
      return null;
    }

    const requestedCallback = getTrustedCallback(url.searchParams.get("redirect_to") || "");
    if (!requestedCallback) return null;

    const callback = new URL("/desktop-auth-callback", requestedCallback.origin);
    callback.searchParams.set("port", String(DESKTOP_AUTH_PORT));
    callback.searchParams.set("return_origin", requestedCallback.origin);
    if (typeof bridgeNonce === "string" && DESKTOP_AUTH_NONCE_PATTERN.test(bridgeNonce)) {
      callback.searchParams.set("bridge_nonce", bridgeNonce);
      callback.searchParams.set("transport", "loopback-get");
    }
    url.searchParams.set("redirect_to", callback.toString());
    return url.toString();
  } catch (_) {
    return null;
  }
}

module.exports = {
  getAppAuthCallbackUrl,
  getDesktopAuthCallbackFromRequest,
  getSafariGoogleOAuthUrl,
  isDesktopAuthCallback,
};
