import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Crown, X, LogIn } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import type { AuthGateDetail } from "@/hooks/useRequireAuth";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "arcai-anon-boost-dismissed";

/**
 * Pinned, dismissible banner above the chat input for anonymous (guest) users.
 * Sells both free sign-in and Boost ($10/mo) in one breath.
 */
export function BoostCtaBanner({ className }: { className?: string }) {
  const { user, isAnonymous, loading } = useAuth();
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  });

  // Reset dismissal once the user actually signs in
  useEffect(() => {
    if (user && !isAnonymous) {
      sessionStorage.removeItem(DISMISS_KEY);
    }
  }, [user, isAnonymous]);

  if (loading) return null;
  if (!isAnonymous && user) return null;
  if (dismissed) return null;

  const openAuth = (feature: "generic" | "boost") => {
    window.dispatchEvent(
      new CustomEvent<AuthGateDetail>("auth-gate-feature", {
        detail: { feature },
      }),
    );
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 6 }}
        transition={{ duration: 0.25 }}
        className={cn(
          "mx-auto w-full max-w-3xl px-3",
          className,
        )}
      >
        <div className="relative flex items-center gap-2 px-3 py-2 rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/10 via-primary/[0.04] to-transparent backdrop-blur-xl shadow-[0_4px_18px_-8px_hsl(var(--primary)/0.35)]">
          <div className="hidden sm:flex h-7 w-7 rounded-full bg-primary/20 items-center justify-center shrink-0">
            <Crown className="h-3.5 w-3.5 text-primary" />
          </div>
          <p className="flex-1 min-w-0 text-[12px] leading-snug text-foreground/85">
            <span className="font-semibold text-foreground">Chatting as a guest.</span>{" "}
            <span className="text-muted-foreground">Sign in free, or Boost for everything.</span>
          </p>
          <button
            onClick={() => openAuth("generic")}
            className="hidden xs:inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-semibold bg-muted/60 hover:bg-muted text-foreground transition-colors shrink-0"
          >
            <LogIn className="h-3 w-3" />
            Sign in
          </button>
          <button
            onClick={() => openAuth("boost")}
            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-bold bg-primary text-primary-foreground hover:brightness-110 transition shrink-0"
          >
            <Crown className="h-3 w-3" />
            Get Boost
          </button>
          <button
            onClick={() => {
              sessionStorage.setItem(DISMISS_KEY, "1");
              setDismissed(true);
            }}
            className="ml-0.5 h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors shrink-0"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
