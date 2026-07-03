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
  const { error: globalError } = await supabase.auth.signOut();

  if (globalError) {
    const { error: localError } = await supabase.auth.signOut({ scope: "local" });
    if (localError) throw localError;
  }

  const { data } = await supabase.auth.getSession();
  if (data.session) {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw error;
  }
}
