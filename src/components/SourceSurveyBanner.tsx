import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { readFirstTouch, inferSourceFromReferrer } from "@/lib/acquisition";
import { cn } from "@/lib/utils";

/**
 * One question, asked once, of people who signed up before the question
 * existed. It is the only way to learn where existing users came from — the
 * referrer that brought them in is long gone.
 *
 * Dismissing counts as an answer: the banner never comes back either way.
 */

const SOURCES = [
  { id: "chatgpt", label: "ChatGPT" },
  { id: "google", label: "Google search" },
  { id: "perplexity", label: "Perplexity" },
  { id: "claude", label: "Claude" },
  { id: "social", label: "Social media" },
  { id: "friend", label: "A friend" },
  { id: "other", label: "Other" },
] as const;

const DISMISS_KEY = "arc_source_survey_dismissed";

export function SourceSurveyBanner() {
  const { user, isAnonymous } = useAuth();
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [other, setOther] = useState("");

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      if (!user || isAnonymous || !supabase || !isSupabaseConfigured) return;
      try {
        if (localStorage.getItem(DISMISS_KEY)) return;
      } catch {
        /* blocked storage just means we may ask again later */
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("signup_source")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        // Most likely the column does not exist yet because the migration has
        // not deployed. Say so plainly rather than failing silently — an unasked
        // survey looks identical to a broken one.
        console.warn(
          "[source survey] could not read signup_source, banner hidden:",
          error.message,
        );
        return;
      }

      if (cancelled) return;

      // No profile row yet is not an answer, so still worth asking.
      if (!data || !data.signup_source) {
        setVisible(true);
      }
    };

    void check();
    return () => {
      cancelled = true;
    };
  }, [user, isAnonymous]);

  const close = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const answer = async (sourceId: string) => {
    if (!user || !supabase) return;
    if (sourceId === "other" && !other.trim()) {
      setExpanded(true);
      return;
    }

    setSaving(true);
    try {
      const firstTouch = readFirstTouch();
      await supabase
        .from("profiles")
        .update({
          signup_source: sourceId,
          signup_source_detail: sourceId === "other" ? other.trim() || null : null,
          // Only recorded if this browser happens to still have it.
          signup_referrer: firstTouch?.referrer || null,
        })
        .eq("user_id", user.id);
    } catch (error) {
      console.warn("Could not save survey answer:", error);
    } finally {
      setSaving(false);
      close();
    }
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="mx-auto w-full max-w-3xl px-3 pt-2"
        >
          <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">We'd like to hear from you!</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  One question, then we'll leave you alone — where'd you hear about us?
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {SOURCES.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      disabled={saving}
                      onClick={() => answer(option.id)}
                      className={cn(
                        "rounded-full border border-border/50 bg-card/50 px-3 py-1.5 text-xs font-medium",
                        "text-muted-foreground transition-colors hover:bg-card hover:text-foreground",
                        "disabled:opacity-50"
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                {expanded && (
                  <div className="mt-2 flex gap-2">
                    <input
                      value={other}
                      onChange={(e) => setOther(e.target.value)}
                      placeholder="Where did you hear about us?"
                      className="flex-1 rounded-full border border-border/50 bg-background/60 px-3 py-1.5 text-xs outline-none focus:border-primary/40"
                      autoFocus
                    />
                    <button
                      type="button"
                      disabled={saving || !other.trim()}
                      onClick={() => answer("other")}
                      className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
                    >
                      Send
                    </button>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={close}
                aria-label="Dismiss survey"
                className="shrink-0 rounded-full p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
