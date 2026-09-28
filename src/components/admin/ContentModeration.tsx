import { useCallback, useEffect, useState } from "react";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Flag = { id: string; source_type: string; signals: string[]; created_at: string; reviewed_at: string | null };
type Run = { status: string; started_at: string; completed_at: string | null; scanned_count: number; flagged_count: number; failed_count: number };
type Detail = { text: string | null; imageUrl: string | null; unavailable: boolean; note: string | null };
export function ContentModeration() {
  const [flags, setFlags] = useState<Flag[]>([]), [run, setRun] = useState<Run | null>(null);
  const [reviewed, setReviewed] = useState(false), [offset, setOffset] = useState(0), [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<string | null>(null), [detail, setDetail] = useState<Detail | null>(null);
  const [translation, setTranslation] = useState<string | null>(null);
  const [note, setNote] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true); setError(""); setSelected(null); setDetail(null); setTranslation(null);
    try {
      const result = await invokeEdgeFunction<{ flags: Flag[]; total: number; run: Run | null }>("content-review", { action: "list", reviewed, offset });
      setFlags(result.flags); setTotal(result.total); setRun(result.run);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load review queue"); }
    finally { setBusy(false); }
  }, [reviewed, offset]);
  useEffect(() => { void load(); }, [load]);
  const open = async (id: string) => {
    setBusy(true); setError(""); setSelected(id); setDetail(null); setTranslation(null); setNote("");
    try { const value = await invokeEdgeFunction<Detail>("content-review", { action: "detail", id }); setDetail(value); setNote(value.note ?? ""); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to open item"); }
    finally { setBusy(false); }
  };
  const translate = async () => {
    setBusy(true); setError("");
    try {
      const result = await invokeEdgeFunction<{ translation: string }>("content-review", { action: "translate", id: selected });
      setTranslation(result.translation);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to translate this message"); }
    finally { setBusy(false); }
  };
  const markReviewed = async () => {
    setBusy(true); setError("");
    try { await invokeEdgeFunction("content-review", { action: "review", id: selected, note }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to save review"); }
    finally { setBusy(false); }
  };
  return <div className="space-y-5">
    <div><h2 className="text-2xl font-semibold">Content Moderation</h2>
      <p className="mt-2 text-sm text-muted-foreground">Weekly automated checks flag stored chats and uploaded or generated images for your review. Your account is excluded. AI flags are leads, not findings of wrongdoing. You make every decision.</p></div>
    <div className="glass-card rounded-2xl p-4 text-sm space-y-2">
      <p>{run ? `Latest scan: ${run.status} · ${run.scanned_count} checked · ${run.flagged_count} flagged · ${run.failed_count} could not be checked` : "The first weekly scan has not started yet."}</p>
      {run && <p className="text-muted-foreground">Started {new Date(run.started_at).toLocaleString()}. New scans start seven days apart; large scans finish in batches.</p>}
      <p className="text-muted-foreground">Coverage: server-stored chat text and supported images in Arc storage, including legacy generated images. Local-only content and external image links are not scanned. Image signals cannot establish age or legality.</p>
    </div>
    <div className="flex flex-wrap gap-2"><Button aria-pressed={!reviewed} variant={reviewed ? "outline" : "default"} disabled={busy} onClick={() => { setReviewed(false); setOffset(0); }}>Needs review</Button>
      <Button aria-pressed={reviewed} variant={reviewed ? "default" : "outline"} disabled={busy} onClick={() => { setReviewed(true); setOffset(0); }}>Reviewed</Button>
      <Button variant="outline" disabled={busy} onClick={() => void load()}>Refresh</Button></div>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {busy && <p role="status" className="text-sm text-muted-foreground">Loading…</p>}
    {!busy && !error && flags.length === 0 && <p className="text-muted-foreground">No {reviewed ? "reviewed" : "pending"} items.</p>}
    {flags.map(flag => <div key={flag.id} className="glass-card rounded-2xl p-4 space-y-3">
      <p className="text-sm font-medium">{flag.source_type === "image" ? "Image" : "Chat message"} · {new Date(flag.created_at).toLocaleString()}</p>
      <p className="text-sm text-muted-foreground">Automated signals: {flag.signals.join(", ")}</p>
      <Button variant="outline" disabled={busy} onClick={() => void open(flag.id)}>Open flagged item</Button>
      {selected === flag.id && detail && <div className="space-y-3">
        {detail.unavailable && <p>Original content is no longer available.</p>}
        {detail.text !== null && <pre className="whitespace-pre-wrap break-words text-sm max-h-96 overflow-auto">{detail.text}</pre>}
        {detail.text !== null && <Button variant="outline" disabled={busy || translation !== null} onClick={() => void translate()}>Translate to English</Button>}
        {translation !== null && <div className="rounded-xl border border-border/50 p-3 space-y-2"><p className="text-xs text-muted-foreground">AI translation · Check against the original before making a decision.</p><pre className="whitespace-pre-wrap break-words text-sm max-h-96 overflow-auto">{translation}</pre></div>}
        {detail.imageUrl && <img src={detail.imageUrl} referrerPolicy="no-referrer" alt="Flagged content for human review" className="max-h-96 max-w-full rounded-xl object-contain" />}
        {!reviewed && <><Textarea value={note} onChange={e => setNote(e.target.value)} maxLength={2000} placeholder="Optional review note" aria-label="Review note" />
          <Button disabled={busy} onClick={() => void markReviewed()}>Mark reviewed</Button><p className="text-xs text-muted-foreground">Saves your review only. No content removal, account action, or report is sent.</p></>}
        {reviewed && detail.note && <p className="text-sm">Your note: {detail.note}</p>}
      </div>}
    </div>)}
    {total > 25 && <div className="flex items-center gap-3"><Button variant="outline" disabled={busy || offset === 0} onClick={() => setOffset(offset - 25)}>Previous</Button>
      <span className="text-sm">{offset + 1}–{Math.min(offset + 25, total)} of {total}</span><Button variant="outline" disabled={busy || offset + 25 >= total} onClick={() => setOffset(offset + 25)}>Next</Button></div>}
  </div>;
}
