import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, X, Smartphone, MonitorSmartphone } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

// Helper functions to detect platform
const isElectron = () => {
  return /electron/i.test(navigator.userAgent);
};

const isMacOS = () => {
  return /Macintosh|MacIntel|MacPPC|Mac68K/i.test(navigator.platform) ||
         /Mac/i.test(navigator.userAgent);
};

const isDesktop = () => {
  return !/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isMacDesktop, setIsMacDesktop] = useState(false);

  useEffect(() => {
    // Don't show anything if running in Electron app
    if (isElectron()) {
      return;
    }

    // Check if Mac desktop
    if (isMacOS() && isDesktop()) {
      setIsMacDesktop(true);

      // Check if we should show the Mac download prompt
      const dismissed = localStorage.getItem('pwa-prompt-dismissed');
      if (dismissed) {
        const dismissedTime = parseInt(dismissed);
        const now = Date.now();
        const twentyFourHours = 24 * 60 * 60 * 1000;

        if (now - dismissedTime < twentyFourHours) {
          return;
        }
      }

      // Show Mac download prompt after a short delay
      setTimeout(() => setShowPrompt(true), 3000);
      return;
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Save the event so it can be triggered later
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Show our custom install prompt
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    // Show the install prompt
    deferredPrompt.prompt();

    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    } else {
      console.log('User dismissed the install prompt');
    }

    // Clear the deferredPrompt
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    // Hide for 24 hours
    localStorage.setItem('pwa-prompt-dismissed', Date.now().toString());
  };

  const handleMacDownload = () => {
    window.open('https://froydinger.com/downloads/', '_blank');
    handleDismiss();
  };

  // Don't show if not prompted and not Mac desktop
  if (!showPrompt || (!deferredPrompt && !isMacDesktop)) return null;

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
              {isMacDesktop ? (
                <MonitorSmartphone className="h-5 w-5 text-primary" />
              ) : (
                <Smartphone className="h-5 w-5 text-primary" />
              )}
            </div>

            <div className="flex-1">
              <h3 className="font-semibold text-foreground mb-1">
                {isMacDesktop ? 'Download ArcAI for Mac' : 'Install ArcAI'}
              </h3>
              <p className="text-sm text-muted-foreground mb-3">
                {isMacDesktop
                  ? 'Get the native Mac app for the best experience with offline support and system integration.'
                  : 'Add ArcAI to your home screen for quick access and a native app experience.'
                }
              </p>

              <div className="flex gap-2">
                <GlassButton
                  variant="glow"
                  size="sm"
                  onClick={isMacDesktop ? handleMacDownload : handleInstall}
                  className="flex-1"
                >
                  <Download className="h-4 w-4 mr-2" />
                  {isMacDesktop ? 'Download' : 'Install'}
                </GlassButton>

                <GlassButton
                  variant="ghost"
                  size="sm"
                  onClick={handleDismiss}
                  className="border border-border"
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