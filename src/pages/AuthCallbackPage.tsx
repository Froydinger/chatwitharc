import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { ThemedLogo } from "@/components/ThemedLogo";

async function recoverReturnedSession() {
  // createClient initializes auth and parses OAuth returns automatically.
  // Calling initialize() again here can race the app-wide AuthProvider.
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw new Error("ArcAI couldn't restore the Google session. Return to sign in and try again.");
  }
  return data.session;
}

export function AuthCallbackPage() {
  const [error, setError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    let active = true;
    let completed = false;
    const query = new URLSearchParams(window.location.search);
    const requestedPath = query.get("next");
    const safePath = requestedPath?.startsWith("/") && !requestedPath.startsWith("//")
      ? requestedPath
      : "/";

    const continueToArc = (session: Session | null) => {
      if (!active || completed || !session) return;
      completed = true;

      const returnOrigin = query.get("return_origin") || query.get("origin");
      if (returnOrigin) {
        try {
          const targetUrl = new URL(returnOrigin);
          if (targetUrl.origin !== window.location.origin) {
            const hashParams = new URLSearchParams();
            if (session.access_token) hashParams.set("access_token", session.access_token);
            if (session.refresh_token) hashParams.set("refresh_token", session.refresh_token);
            const targetCallback = `${targetUrl.origin}/auth/callback#${hashParams.toString()}`;
            window.location.replace(targetCallback);
            return;
          }
        } catch (_) {
          // Ignore invalid returnOrigin and proceed normally.
        }
      }

      window.history.replaceState({}, document.title, "/auth/callback");
      // Keep an explicitly requested in-app destination after OAuth (such as
      // the public account deletion page); otherwise land in a new chat.
      window.location.replace(safePath);
    };

    const slowTimer = window.setTimeout(() => {
      if (active && !completed) setSlow(true);
    }, 15000);

    // Supabase emits SIGNED_IN after it validates and stores an implicit grant.
    // Listening here lets a slow mobile validation complete the redirect even
    // after we have shown the non-terminal “taking longer” message.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "INITIAL_SESSION" || event === "SIGNED_IN") && session) {
        continueToArc(session);
      }
    });

    const finish = async () => {
      try {
        const session = await recoverReturnedSession();
        if (!session) throw new Error("Google returned successfully, but no ArcAI session was created.");
        continueToArc(session);
      } catch (cause) {
        if (active && !completed) setError(cause instanceof Error ? cause.message : "Could not finish sign in.");
      }
    };
    void finish();
    return () => {
      active = false;
      window.clearTimeout(slowTimer);
      subscription.unsubscribe();
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
      <div className="max-w-md text-center space-y-5">
        <ThemedLogo className="h-16 w-16 mx-auto" alt="ArcAI" />
        <h1 className="text-2xl font-semibold">
          {error ? "Sign-in needs another try" : slow ? "Still finishing sign in…" : "Finishing sign in..."}
        </h1>
        <p className="text-sm text-muted-foreground">
          {error ?? (slow
            ? "Google’s return is taking longer than usual. Arc is still checking your session and will continue if it completes."
            : "Securing your ArcAI session and opening your chat.")}
        </p>
        {(error || slow) && <a className="inline-flex text-primary underline" href="/">Return to ArcAI</a>}
      </div>
    </div>
  );
}
