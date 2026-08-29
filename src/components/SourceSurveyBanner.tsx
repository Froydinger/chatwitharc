import { useEffect, useState } from "react";
import { Check, Search, Share2, Sparkles, Users, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const DISMISSED_PREFIX = "arcai-source-survey-dismissed:";
const OPTIONS = [
  { value: "chatgpt", label: "ChatGPT", icon: Sparkles },
  { value: "google", label: "Google search", icon: Search },
  { value: "perplexity", label: "Perplexity", icon: Search },
  { value: "claude", label: "Claude", icon: Sparkles },
  { value: "social", label: "Social media", icon: Share2 },
  { value: "friend", label: "A friend", icon: Users },
  { value: "other", label: "Other", icon: ChevronIcon },
] as const;

function ChevronIcon() { return <span aria-hidden="true">›</span>; }
type Source = (typeof OPTIONS)[number]["value"];

/** The one source survey. It is global so every newly-created account sees it. */
export function SourceSurveyBanner() {
  const { user, isAnonymous, loading: authLoading } = useAuth();
  const [visible, setVisible] = useState(false);
  const [selected, setSelected] = useState<Source | null>(null);
  const [other, setOther] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (authLoading || !user || isAnonymous || !supabase || !isSupabaseConfigured) return;
    const key = `${DISMISSED_PREFIX}${user.id}`;
    try { if (localStorage.getItem(key) === "1") return; } catch { /* continue */ }
    let cancelled = false;
    void supabase.from("profiles").select("signup_source").eq("user_id", user.id).maybeSingle().then(({ data, error }) => {
      if (error) console.warn("[source survey] could not check answer", error.message);
      if (!cancelled && !error && !data?.signup_source) setVisible(true);
    });
    return () => { cancelled = true; };
  }, [authLoading, user, isAnonymous]);

  const dismiss = () => {
    if (user) try { localStorage.setItem(`${DISMISSED_PREFIX}${user.id}`, "1"); } catch { /* ignore */ }
    setVisible(false);
  };

  const submit = async () => {
    if (!user || !supabase || !selected || (selected === "other" && !other.trim())) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      signup_source: selected,
      signup_source_detail: selected === "other" ? other.trim().slice(0, 200) : null,
    }).eq("user_id", user.id);
    setSaving(false);
    if (!error) dismiss();
    else console.warn("[source survey] could not save answer", error.message);
  };

  return <AnimatePresence>{visible && (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mx-auto w-full max-w-3xl px-3 pt-2">
      <div className="relative rounded-2xl border border-primary/25 bg-background/95 px-4 py-3 shadow-lg backdrop-blur-xl sm:px-5">
        <button type="button" onClick={dismiss} aria-label="Dismiss survey" className="absolute right-4 top-4 rounded-full p-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground"><X className="h-4 w-4" /></button>
        <p className="pr-7 text-sm font-semibold text-foreground">Quick question about ArcAI</p>
        <p className="mt-1 pr-7 text-xs text-muted-foreground">How did you hear about us? It helps us keep building the right things.</p>
        <div className="mt-3 flex flex-wrap gap-2 pr-6">
          {OPTIONS.map(({ value, label, icon: Icon }) => <button key={value} type="button" disabled={saving} onClick={() => setSelected(value)} className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition", selected === value ? "border-primary/60 bg-primary/10 text-foreground" : "border-border/50 bg-muted/20 text-muted-foreground hover:border-primary/40 hover:text-foreground")}><Icon className="h-3.5 w-3.5" />{label}{selected === value && <Check className="h-3.5 w-3.5 text-primary" />}</button>)}
        </div>
        {selected === "other" && <div className="mt-2 flex gap-2 pr-6"><input value={other} onChange={(event) => setOther(event.target.value)} maxLength={200} autoFocus placeholder="Tell us where" className="min-w-0 flex-1 rounded-full border border-border/50 bg-muted/20 px-3 py-1.5 text-xs text-foreground outline-none focus:border-primary/60" /><button type="button" disabled={saving || !other.trim()} onClick={() => void submit()} className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40">{saving ? "Saving…" : "Send"}</button></div>}
        {selected && selected !== "other" && <button type="button" disabled={saving} onClick={() => void submit()} className="mt-3 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40">{saving ? "Saving…" : "Send answer"}</button>}
      </div>
    </motion.div>
  )}</AnimatePresence>;
}
