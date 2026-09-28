import { useEffect, useState } from "react";
// Do not depend on an authenticated session: suspended/deleted users need this page.
async function invokeEdgeFunction<T = unknown>(
  _name: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/account-lifecycle`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify(body),
    },
  );
  const result = await response.json();
  if (!response.ok || result.error) {
    throw new Error(result.error || "Account controls are unavailable");
  }
  return result;
}
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
type Status = {
  state: string;
  kind: string;
  deleteAfter: string | null;
  reason: string | null;
  cleanupError: string | null;
};
export default function AccountAppealPage() {
  const [token] = useState(() => window.location.hash.slice(1));
  const [status, setStatus] = useState<Status | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false);
  const load = async () => {
    try {
      setStatus(
        await invokeEdgeFunction<Status>("account-lifecycle", {
          action: "status",
          token,
        }),
      );
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to load account status",
      );
    }
  };
  useEffect(() => {
    void load();
  }, [token]);
  const act = async (action: string) => {
    setBusy(true);
    setError("");
    try {
      await invokeEdgeFunction("account-lifecycle", {
        action,
        token,
        message,
        confirm,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to submit");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="min-h-screen bg-background text-foreground p-6">
      <section className="max-w-xl mx-auto glass-card rounded-2xl p-6 space-y-4">
        <h1 className="text-2xl font-semibold">ArcAI account controls</h1>
        <p className="text-sm text-muted-foreground">
          Keep this private link secure. It works even while your account is
          suspended.
        </p>
        {error && <p role="alert">{error}</p>}
        {status && (
          <>
            <p>
              Status: <strong>{status.state}</strong>
            </p>
            {status.reason && <p>Reason: {status.reason}</p>}
            {status.deleteAfter && status.state === "suspended" && (
              <p>
                Appeal before {new Date(status.deleteAfter).toLocaleString()}
                {" "}
                to pause deletion.
              </p>
            )}
            {["notice_pending", "suspended", "held"].includes(status.state) &&
              status.kind === "ban" && (
              <>
                <Textarea
                  aria-label="Your appeal"
                  placeholder="Explain why you believe this decision should be reconsidered"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={5000}
                />
                <Button
                  disabled={busy || message.trim().length < 10}
                  onClick={() => void act("appeal")}
                >
                  Submit appeal and pause deletion
                </Button>
              </>
            )}
            {status.state === "appealed" && (
              <p>
                Your appeal is saved. Automatic deletion is paused while the
                owner reviews it.
              </p>
            )}
            {status.state === "held" && (
              <p>Scheduled deletion has been stopped by the owner.</p>
            )}
            {status.state === "restored" && (
              <a href="/">Your access has been restored. Sign in to ArcAI.</a>
            )}
            {status.state === "deleting" && (
              <p>
                Your deletion request is processing. You do not need to keep
                this page open. Use Refresh to check completion.
              </p>
            )}
            {status.state === "deleted" && (
              <p>
                Your ArcAI account and stored content have been
                deleted.{status.kind === "ban"
                  ? " Only a blocked-account fingerprint is retained to enforce the ban."
                  : ""}
              </p>
            )}
            {status.cleanupError && <p role="status">{status.cleanupError}</p>}
            {["notice_pending", "suspended", "held", "appealed"].includes(
              status.state,
            ) && (
              <div className="border-t pt-4 space-y-3">
                <h2 className="font-semibold">Delete my account now</h2>
                <p className="text-sm">
                  This permanently deletes your ArcAI account and content,
                  including your appeal. It cannot be undone. A pre-existing ban
                  remains in effect. Cancel Google Play subscriptions in Google
                  Play.
                </p>
                <Input
                  aria-label="Type DELETE to confirm"
                  placeholder="Type DELETE"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
                <Button
                  variant="destructive"
                  disabled={busy || confirm !== "DELETE"}
                  onClick={() => void act("delete")}
                >
                  Permanently delete my account
                </Button>
              </div>
            )}
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void load()}
            >
              Refresh
            </Button>
          </>
        )}
        <p className="text-sm">
          Need help?{" "}
          <a href="mailto:arc@froydinger.com" className="underline">
            arc@froydinger.com
          </a>
        </p>
      </section>
    </main>
  );
}
