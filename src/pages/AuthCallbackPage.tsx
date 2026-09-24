import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ThemedLogo } from "@/components/ThemedLogo";

async function recoverReturnedSession() {
  // Supabase owns the OAuth callback URL and processes its implicit grant or
  // PKCE code during client initialization. Re-exchanging the code or calling
  // setSession here races that initialization (which can leave mobile Chrome
  // stuck on the callback screen).
  const { error: initializationError } = await supabase.auth.initialize();
  if (initializationError) {
    throw new Error("ArcAI couldn't verify the Google sign-in. Return to sign in and try again.");
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw new Error("ArcAI couldn't restore the Google session. Return to sign in and try again.");
  }
  return data.session;
}

export function AuthCallbackPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let timeoutId: number | undefined;
    const finish = async () => {
      try {
        const session = await Promise.race([
          recoverReturnedSession(),
          new Promise<never>((_, reject) => {
            timeoutId = window.setTimeout(() => {
              reject(new Error("Google sign-in is taking too long. Check your connection, then return to sign in and try again."));
            }, 15000);
          }),
        ]);
        if (!active) return;
        if (!session) throw new Error("Google returned successfully, but no ArcAI session was created.");

        const query = new URLSearchParams(window.location.search);
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
            // Ignore invalid returnOrigin and proceed normally
          }
        }

        const requestedPath = query.get("next");
        const safePath = requestedPath?.startsWith("/") && !requestedPath.startsWith("//")
          ? requestedPath
          : "/";
        window.history.replaceState({}, document.title, "/auth/callback");
        // Keep an explicitly requested in-app destination after OAuth (such as
        // the public account deletion page); otherwise land in a new chat.
        window.location.replace(safePath);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not finish sign in.");
      } finally {
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      }
    };
    void finish();
    return () => {
      active = false;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
      <div className="max-w-md text-center space-y-5">
        <ThemedLogo className="h-16 w-16 mx-auto" alt="ArcAI" />
        <h1 className="text-2xl font-semibold">{error ? "Sign-in needs another try" : "Finishing sign in..."}</h1>
        <p className="text-sm text-muted-foreground">{error ?? "Securing your ArcAI session and opening your chat."}</p>
        {error && <a className="inline-flex text-primary underline" href="/">Return to sign in</a>}
      </div>
    </div>
  );
}
