import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ThemedLogo } from "@/components/ThemedLogo";
import { GlassButton } from "@/components/ui/glass-button";

async function recoverResetSession() {
  const query = new URLSearchParams(window.location.search);
  const code = query.get("code");
  if (code) await supabase.auth.exchangeCodeForSession(code).catch(() => null);

  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  if (accessToken && refreshToken) {
    await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  }
  return (await supabase.auth.getSession()).data.session;
}

export function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("Checking your reset link...");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void recoverResetSession().then((session) => {
      if (!session) {
        setMessage("This reset link is invalid or expired. Request a new one from the sign-in box.");
        return;
      }
      window.history.replaceState({}, document.title, "/auth/reset-password");
      setReady(true);
      setMessage("Choose a new password for your ArcAI account.");
    }).catch(() => setMessage("This reset link could not be verified. Request a new one."));
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password.length < 8) return setMessage("Use at least 8 characters.");
    if (password !== confirmPassword) return setMessage("The passwords do not match.");
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setMessage(error.message);
      setSaving(false);
      return;
    }
    window.location.replace("/dashboard");
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6 rounded-3xl border border-border/40 bg-card/70 p-8 text-center shadow-2xl backdrop-blur-xl">
        <ThemedLogo className="h-16 w-16 mx-auto" alt="ArcAI" />
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Reset your password</h1>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
        {ready ? (
          <form onSubmit={submit} className="space-y-4 text-left">
            <input className="w-full rounded-xl border border-border bg-background px-4 py-3" type="password" autoComplete="new-password" placeholder="New password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            <input className="w-full rounded-xl border border-border bg-background px-4 py-3" type="password" autoComplete="new-password" placeholder="Confirm new password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
            <GlassButton variant="glow" className="w-full" type="submit" disabled={saving}>{saving ? "Saving..." : "Set new password"}</GlassButton>
          </form>
        ) : <a className="inline-flex text-primary underline" href="/">Return to sign in</a>}
      </div>
    </div>
  );
}
