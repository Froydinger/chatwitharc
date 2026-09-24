import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DeleteDataModal } from "@/components/DeleteDataModal";
import { useAuth } from "@/hooks/useAuth";
import { getAuthRedirectUrl, signInWithGoogle, signOutCurrentSession } from "@/integrations/auth";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { useArcStore } from "@/store/useArcStore";

export default function DeleteAccountPage() {
  const { user, loading, isAnonymous } = useAuth();
  const { clearAllSessions } = useArcStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleEmailSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    if (!supabase || !isSupabaseConfigured) {
      setErrorMessage("Account sign-in is temporarily unavailable. Please try again later.");
      return;
    }

    setIsSigningIn(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setIsSigningIn(false);
    if (error) setErrorMessage("We couldn't sign you in. Check your details and try again.");
  };

  const handleGoogleSignIn = async () => {
    setErrorMessage(null);
    setIsSigningIn(true);
    try {
      const { error } = await signInWithGoogle(getAuthRedirectUrl("/auth/callback?next=%2Fdelete-account"));
      if (error) setErrorMessage("Google sign-in didn't start. Please try again.");
    } catch {
      setErrorMessage("Google sign-in didn't start. Please try again.");
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleDeleted = () => {
    clearAllSessions();
    void signOutCurrentSession();
    window.location.replace("/");
  };

  return (
    <main className="min-h-screen bg-background px-4 py-12 text-foreground sm:py-20">
      <div className="mx-auto max-w-xl">
        <Link to="/" className="text-sm text-muted-foreground underline underline-offset-4">ArcAI home</Link>
        <section className="glass-card mt-6 rounded-3xl border border-border/40 p-6 sm:p-9">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-3 text-primary"><ShieldCheck className="h-5 w-5" /></div>
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">ArcAI account controls</p>
              <h1 className="text-2xl font-semibold">Request account deletion</h1>
            </div>
          </div>

          <p className="text-sm leading-6 text-muted-foreground">
            Sign in to the ArcAI account you want removed. We’ll ask you to confirm, then permanently delete the account
            and associated ArcAI data.
          </p>

          <div className="mt-5 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm">
            <p className="font-medium text-foreground">Before you delete</p>
            <p className="mt-1 text-muted-foreground">
              Account deletion does not cancel a paid Boost subscription. Cancel it first in Google Play or ArcAI billing
              settings to stop renewal.
            </p>
            <a
              href="https://play.google.com/store/account/subscriptions?package=chat.askarc.android"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-primary underline underline-offset-2"
            >
              Manage Google Play subscriptions
            </a>
          </div>

          {loading ? (
            <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Checking sign-in…</div>
          ) : user && !isAnonymous ? (
            <div className="mt-7 space-y-4">
              <p className="text-sm">Signed in as <strong>{user.email || "ArcAI account"}</strong>.</p>
              <Button variant="destructive" onClick={() => setShowDeleteModal(true)}>
                <Trash2 className="mr-2 h-4 w-4" /> Continue to delete account
              </Button>
            </div>
          ) : (
            <div className="mt-7 space-y-5">
              {user && isAnonymous && (
                <p className="text-sm text-muted-foreground">Sign in to the account you want deleted. Guest sessions are not registered ArcAI accounts.</p>
              )}
              <Button className="w-full" variant="outline" onClick={handleGoogleSignIn} disabled={isSigningIn}>
                {isSigningIn ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Continue with Google
              </Button>
              <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or email<span className="h-px flex-1 bg-border" /></div>
              <form onSubmit={handleEmailSignIn} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="delete-account-email">Email</Label>
                  <Input id="delete-account-email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="delete-account-password">Password</Label>
                  <Input id="delete-account-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
                </div>
                <Button type="submit" className="w-full" disabled={isSigningIn}>
                  {isSigningIn ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Sign in to request deletion
                </Button>
              </form>
              {errorMessage && <p role="alert" className="text-sm text-destructive">{errorMessage}</p>}
              <p className="text-xs text-muted-foreground">
                If you can’t access your sign-in method, contact <a className="underline" href="mailto:arc@froydinger.com?subject=ArcAI%20account%20deletion">ArcAI support</a> from your account email.
              </p>
            </div>
          )}

          <p className="mt-8 border-t border-border/30 pt-4 text-xs text-muted-foreground">
            Read the <Link to="/privacy" className="underline">ArcAI Privacy Notice</Link> for data retention details.
          </p>
        </section>
      </div>

      <DeleteDataModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onDeleted={handleDeleted}
      />
    </main>
  );
}
