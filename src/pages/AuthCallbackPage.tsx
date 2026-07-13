import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ThemedLogo } from "@/components/ThemedLogo";

async function recoverReturnedSession() {
  const query = new URLSearchParams(window.location.search);
  const code = query.get("code");
  if (code) {
    // Supabase may already have consumed the PKCE code during client startup.
    // If so, this harmlessly fails and getSession below returns that session.
    await supabase.auth.exchangeCodeForSession(code).catch(() => null);
  }

  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  if (accessToken && refreshToken) {
    await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  }

  return (await supabase.auth.getSession()).data.session;
}

export function AuthCallbackPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const finish = async () => {
      try {
        const session = await recoverReturnedSession();
        if (!active) return;
        if (!session) throw new Error("Google returned successfully, but no ArcAI session was created.");
        window.history.replaceState({}, document.title, "/auth/callback");
        window.location.replace("/dashboard");
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not finish sign in.");
      }
    };
    void finish();
    return () => { active = false; };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
      <div className="max-w-md text-center space-y-5">
        <ThemedLogo className="h-16 w-16 mx-auto" alt="ArcAI" />
        <h1 className="text-2xl font-semibold">{error ? "Sign-in needs another try" : "Finishing sign in..."}</h1>
        <p className="text-sm text-muted-foreground">{error ?? "Securing your ArcAI session and opening your dashboard."}</p>
        {error && <a className="inline-flex text-primary underline" href="/">Return to sign in</a>}
      </div>
    </div>
  );
}
