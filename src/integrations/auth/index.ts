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
