import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, X } from "lucide-react";
import { GlassButton } from "@/components/ui/glass-button";
import { useAuth } from "@/hooks/useAuth";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { toast } from "sonner";

const DISMISS_KEY = "push-prompt-dismissed-at";
const FOREVER_KEY = "push-prompt-hidden-forever";
const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h

export function PWAInstallPrompt() {
  const { user } = useAuth();
  const {
    supported,
    subscribed,
    permission,
    loading,
    availabilityReason,
    subscribe,
  } = usePushNotifications();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!user) {
      setShow(false);
      return;
    }
    if (!supported || subscribed) {
      setShow(false);
      return;
    }
    // Only prompt when the OS prompt is actually available
    if (permission === "denied") {
      setShow(false);
      return;
    }
    if (availabilityReason !== "ready") {
      // ios/macOS-needs-install or unsupported — don't nag
      setShow(false);
      return;
    }
    if (localStorage.getItem(FOREVER_KEY) === "true") return;
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (dismissedAt && Date.now() - dismissedAt < COOLDOWN_MS) return;

    const t = window.setTimeout(() => setShow(true), 2500);
    return () => window.clearTimeout(t);
  }, [user, supported, subscribed, permission, availabilityReason]);

  const handleEnable = async () => {
    try {
      await subscribe();
      toast.success("Push enabled — check for the welcome ping!");
      setShow(false);
    } catch (e: any) {
      toast.error(e?.message || "Couldn't enable push");
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setShow(false);
  };

  const handleHideForever = () => {
    localStorage.setItem(FOREVER_KEY, "true");
    setShow(false);
  };

  if (!show) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 100 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 100 }}
        transition={{ type: "spring", damping: 20 }}
        className="fixed bottom-32 left-4 right-4 z-50 md:left-auto md:right-8 md:w-80"
      >
        <div className="bg-card/95 backdrop-blur-xl border border-border rounded-2xl p-4 shadow-xl">
          <div className="flex items-start gap-3">
            <div className="bg-primary/10 rounded-lg p-2">
              <Bell className="h-5 w-5 text-primary" />
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground mb-1">
                Turn on notifications
              </h3>
              <p className="text-sm text-muted-foreground mb-3">
                Get pinged when scheduled tasks finish or someone @mentions you in a shared chat.
              </p>

              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <GlassButton
                    variant="glow"
                    size="sm"
                    onClick={handleEnable}
                    disabled={loading}
                    className="flex-1"
                  >
                    <Bell className="h-4 w-4 mr-2" />
                    {loading ? "Enabling…" : "Enable"}
                  </GlassButton>

                  <GlassButton
                    variant="ghost"
                    size="sm"
                    onClick={handleDismiss}
                    className="border border-border"
                    aria-label="Dismiss for 24 hours"
                  >
                    <X className="h-4 w-4" />
                  </GlassButton>
                </div>
                <button
                  onClick={handleHideForever}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors text-left"
                >
                  Don't show again
                </button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
