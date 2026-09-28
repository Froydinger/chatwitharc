import { useEffect, useState } from "react";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
type Case = {
  id: string;
  email: string | null;
  state: string;
  kind: string;
  reason: string | null;
  appeal_text: string | null;
  delete_after: string | null;
  last_error: string | null;
};
export function BanAccount(
  { flagId, email, onDone }: {
    flagId: string;
    email: string;
    onDone: () => void;
  },
) {
  const [open, setOpen] = useState(false),
    [reason, setReason] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const ban = async () => {
    setBusy(true);
    setError("");
    try {
      await invokeEdgeFunction("account-lifecycle", {
        action: "ban",
        flagId,
        reason,
        confirmEmail: confirm,
      });
      setOpen(false);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ban failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="border-t pt-3 space-y-3">
      <p className="text-sm">Account: {email}</p>
      <Button variant="destructive" onClick={() => setOpen(!open)}>
        Ban user…
      </Button>
      {open && (
        <div className="space-y-3">
          <p className="text-sm">
            Freeze this account now and email a 30-day appeal link. Without an
            appeal, account deletion runs automatically after the deadline. An
            appeal pauses deletion. This is your decision, not the scanner’s.
          </p>
          <Textarea
            aria-label="Reason for suspension"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={2000}
            placeholder="Reason sent to the user"
          />
          <Input
            aria-label="Confirm account email"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={`Type ${email} to confirm`}
          />
          <Button
            variant="destructive"
            disabled={busy || confirm.toLowerCase() !== email.toLowerCase() ||
              reason.trim().length < 10}
            onClick={() => void ban()}
          >
            Confirm ban and 30-day appeal window
          </Button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
export function AccountActions({ revision }: { revision: number }) {
  const [cases, setCases] = useState<Case[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(""),
    [finalize, setFinalize] = useState<string | null>(null);
  const load = async () => {
    try {
      setCases(
        (await invokeEdgeFunction<{ cases: Case[] }>("account-lifecycle", {
          action: "list",
        })).cases,
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to load account actions",
      );
    }
  };
  useEffect(() => {
    void load();
  }, [revision]);
  const act = async (action: string, id: string) => {
    setBusy(true);
    setError("");
    try {
      await invokeEdgeFunction("account-lifecycle", {
        action,
        id,
        confirmEmail: confirm,
      });
      setFinalize(null);
      setConfirm("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="glass-card p-4 rounded-2xl space-y-3">
      <h3 className="font-semibold">Account actions and appeals</h3>
      <Button variant="outline" onClick={() => void load()}>
        Refresh account actions
      </Button>
      {error && <p role="alert">{error}</p>}
      {cases.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No suspensions or deletion requests.
        </p>
      )}
      {cases.map((c) => (
        <div key={c.id} className="border-t py-3 space-y-2">
          <p>{c.email ?? "Deleted account"} · {c.state}</p>
          {c.delete_after && (
            <p className="text-sm">
              Deletion scheduled: {new Date(c.delete_after).toLocaleString()}
            </p>
          )}
          {c.reason && <p className="text-sm">Reason: {c.reason}</p>}
          {c.appeal_text && (
            <p className="whitespace-pre-wrap text-sm">
              Appeal: {c.appeal_text}
            </p>
          )}
          {c.last_error && <p role="alert">{c.last_error}</p>}
          {["notice_pending", "suspended", "appealed", "held"].includes(
            c.state,
          ) && (
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={busy}
                variant="outline"
                onClick={() => void act("hold", c.id)}
              >
                Stop scheduled deletion
              </Button>
              <Button disabled={busy} onClick={() => void act("restore", c.id)}>
                Restore account
              </Button>
              {["held", "appealed"].includes(c.state) && (
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={() => {
                    setFinalize(c.id);
                    setConfirm("");
                  }}
                >
                  Finalize ban and delete…
                </Button>
              )}
            </div>
          )}
          {finalize === c.id && (
            <div className="space-y-2">
              <p>
                Permanent deletion cannot be undone. Type the account email to
                confirm your final decision.
              </p>
              <Input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                aria-label="Email confirmation for final deletion"
              />
              <Button
                variant="destructive"
                disabled={busy ||
                  confirm.toLowerCase() !== c.email?.toLowerCase()}
                onClick={() => void act("finalize", c.id)}
              >
                Confirm permanent deletion
              </Button>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
