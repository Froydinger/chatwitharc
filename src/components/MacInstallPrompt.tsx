import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Download, X } from "lucide-react";
import { GlassButton } from "@/components/ui/glass-button";
import { AppleLogo } from "@/components/icons/AppleLogo";
import { isMacDesktopBrowser } from "@/utils/platform";
import { useLocation } from "react-router-dom";

const DECISION_KEY = "arcai-mac-install-decision-at";
const DECISION_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

export function MacInstallPrompt() {
  const { pathname } = useLocation();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (pathname === "/downloads" || !isMacDesktopBrowser() || window.innerWidth < 768) {
      setShow(false);
      return;
    }

    const decidedAt = Number(localStorage.getItem(DECISION_KEY) || 0);
    if (decidedAt && Date.now() - decidedAt < DECISION_COOLDOWN_MS) return;

    const timer = window.setTimeout(() => setShow(true), 2500);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  const rememberDecision = () => {
    localStorage.setItem(DECISION_KEY, String(Date.now()));
    setShow(false);
  };

  const handleDownload = () => {
    rememberDecision();
    window.location.assign("/downloads");
  };

  if (!show) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 100 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 100 }}
        transition={{ type: "spring", damping: 20 }}
        className="fixed bottom-8 left-4 right-4 z-50 md:left-auto md:right-8 md:w-96"
      >
        <div className="rounded-2xl border border-border bg-card/95 p-4 shadow-xl backdrop-blur-xl">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <AppleLogo className="h-5 w-5 text-foreground" />
            </div>

            <div className="min-w-0 flex-1">
              <h3 className="mb-1 font-semibold text-foreground">Get ArcAI for Mac</h3>
              <p className="mb-3 text-sm text-muted-foreground">
                The native Mac app is updated and ready for a faster, focused ArcAI experience.
              </p>

              <div className="flex gap-2">
                <GlassButton
                  variant="glow"
                  size="sm"
                  onClick={handleDownload}
                  className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download for Mac
                </GlassButton>
                <GlassButton
                  variant="ghost"
                  size="sm"
                  onClick={rememberDecision}
                  className="border border-border"
                  aria-label="Not now"
                >
                  <X className="h-4 w-4" />
                </GlassButton>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
