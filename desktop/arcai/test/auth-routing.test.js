const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getAppAuthCallbackUrl,
  getSafariGoogleOAuthUrl,
  isDesktopAuthCallback,
} = require("../auth-routing");

function startUrl({
  host = "jpqtoixhjnfdubvqshwk.supabase.co",
  protocol = "https:",
  path = "/auth/v1/authorize",
  provider = "google",
  redirectTo = "https://askarc.chat/auth/callback?return_origin=https%3A%2F%2Faskarc.chat",
} = {}) {
  const url = new URL(`${protocol}//${host}${path}`);
  url.searchParams.set("provider", provider);
  url.searchParams.set("redirect_to", redirectTo);
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

test("rewrites trusted Google OAuth callback to the desktop bridge", () => {
  const result = getSafariGoogleOAuthUrl(startUrl());
  assert.ok(result);

  const oauth = new URL(result);
  assert.equal(oauth.origin, "https://jpqtoixhjnfdubvqshwk.supabase.co");
  assert.equal(oauth.pathname, "/auth/v1/authorize");
  assert.equal(oauth.searchParams.get("provider"), "google");
  assert.equal(oauth.searchParams.get("prompt"), "select_account");

  const callback = new URL(oauth.searchParams.get("redirect_to"));
  assert.equal(callback.origin, "https://askarc.chat");
  assert.equal(callback.pathname, "/desktop-auth-callback");
  assert.equal(callback.searchParams.get("port"), "48879");
  assert.equal(callback.searchParams.get("return_origin"), "https://askarc.chat");
});

test("accepts ArcAI's custom Supabase auth host", () => {
  const result = getSafariGoogleOAuthUrl(startUrl({ host: "auth.askarc.chat" }));
  assert.ok(result);
  assert.equal(new URL(result).hostname, "auth.askarc.chat");
  assert.equal(new URL(new URL(result).searchParams.get("redirect_to")).port, "");
});

test("rejects auth starts outside the exact HTTPS Supabase authorize route", () => {
  for (const value of [
    startUrl({ protocol: "http:" }),
    startUrl({ host: "jpqtoixhjnfdubvqshwk.supabase.co.attacker.example" }),
    startUrl({ host: "jpqtoixhjnfdubvqshwk.supabase.co:8443" }),
    startUrl({ path: "/auth/v1/token" }),
    startUrl({ provider: "github" }),
    `https://user@arcproject.supabase.co/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent("https://askarc.chat/auth/callback")}`,
  ]) {
    assert.equal(getSafariGoogleOAuthUrl(value), null, value);
  }
});

test("rejects callbacks outside ArcAI's trusted origins and routes", () => {
  for (const redirectTo of [
    "https://attacker.example/auth/callback",
    "https://askarc.chat.evil.example/auth/callback",
    "http://askarc.chat/auth/callback",
    "https://askarc.chat/dashboard",
    "https://askarc.chat/desktop-auth-callback?port=48880",
  ]) {
    assert.equal(getSafariGoogleOAuthUrl(startUrl({ redirectTo })), null, redirectTo);
  }
});

test("accepts only HTTPS callbacks on trusted ArcAI origins and the bridge route", () => {
  assert.equal(
    isDesktopAuthCallback("https://chatwitharc.com/desktop-auth-callback?port=48879"),
    true,
  );
  for (const value of [
    "http://askarc.chat/desktop-auth-callback?port=48879",
    "https://attacker.example/desktop-auth-callback?port=48879",
    "https://askarc.chat/auth/callback?port=48879",
    "https://askarc.chat/desktop-auth-callback?port=48880",
  ]) {
    assert.equal(isDesktopAuthCallback(value), false, value);
  }
});

test("forwards PKCE codes and errors to the app callback without exchanging them externally", () => {
  const href = "https://chatwitharc.com/desktop-auth-callback?code=one-time-code&port=48879&return_origin=https%3A%2F%2Fchatwitharc.com#access_token=legacy-token";
  const target = new URL(getAppAuthCallbackUrl(href));
  assert.equal(target.origin, "https://askarc.chat");
  assert.equal(target.pathname, "/auth/callback");
  assert.equal(target.searchParams.get("code"), "one-time-code");
  assert.equal(target.hash, "#access_token=legacy-token");

  const errorTarget = new URL(getAppAuthCallbackUrl(
    "https://askarc.chat/desktop-auth-callback?error=access_denied&error_code=403&port=48879",
  ));
  assert.equal(errorTarget.searchParams.get("error"), "access_denied");
  assert.equal(errorTarget.searchParams.get("error_code"), "403");
});
