import { supabase } from "@/integrations/supabase/client";

export function getAuthRedirectUrl(path = "") {
  return `${window.location.origin}${path}`;
}

export function signInWithGoogle(redirectTo = getAuthRedirectUrl()) {
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      queryParams: { prompt: "select_account" },
    },
  });
}

/**
 * Clear the browser session even when the server can no longer revoke it.
 * This matters for migrated/merged users whose currently cached token may
 * reference an Auth record that has already been consolidated.
 */
export async function signOutCurrentSession() {
  // Fire Supabase sign out in the background without blocking the UI
  try {
    supabase.auth.signOut().catch(() => {});
  } catch (e) {
    // Ignore global sign out error and fallback to local
  }

  try {
    supabase.auth.signOut({ scope: "local" }).catch(() => {});
  } catch (e) {
    // Ignore
  }

  // Robust manual cleanup of localStorage Supabase auth keys
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith("sb-") || key.includes("supabase"))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch (e) {
    // Ignore storage issues
  }

  // Clear any auth cookies if present
  try {
    document.cookie.split(";").forEach((c) => {
      const eqPos = c.indexOf("=");
      const name = eqPos > -1 ? c.substring(0, eqPos).trim() : c.trim();
      if (name.startsWith("sb-") || name.includes("supabase") || name.includes("auth")) {
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
      }
    });
  } catch (e) {
    // Ignore cookie issues
  }
}
