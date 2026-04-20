import { useState, useEffect } from "react";
import { X, Crown, Quote, ChevronLeft, Lock, Unlock } from "lucide-react";
import { useCorporateModeStore } from "@/store/useCorporateModeStore";
import { useAccentStore } from "@/store/useAccentStore";
import { useLocalAIStore } from "@/store/useLocalAIStore";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ChatHistoryPanel } from "@/components/ChatHistoryPanel";
import { QuotePanel } from "@/components/QuotePanel";
import { cn } from "@/lib/utils";
import { useAdminBanner } from "@/components/AdminBanner";
import { useSubscription } from "@/hooks/useSubscription";

export type RightPanelTab = "history" | "quote" | "settings";

interface RightPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: RightPanelTab;
  onTabChange: (tab: RightPanelTab) => void;
}

export function RightPanel({ isOpen, onClose, activeTab, onTabChange }: RightPanelProps) {
  // Detect PWA/Electron mode for conditional spacing
  const [isStandaloneApp, setIsStandaloneApp] = useState(false);
  const isAdminBannerActive = useAdminBanner();
  const { isSubscribed } = useSubscription();

  useEffect(() => {
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || 
                  (window.navigator as any).standalone === true;
    const isElectron = /electron/i.test(navigator.userAgent);
    const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || 
                           (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);
    setIsStandaloneApp((isPWA || isElectron) && !isMobileDevice);
  }, []);

  // Reset to chat history when sidebar opens
  useEffect(() => {
    if (isOpen) {
      onTabChange("history");
    }
  }, [isOpen, onTabChange]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  return (
    <>
      {/* Mobile backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      {/* Panel - snappy with rebound like pulling out a physical shelf */}
      <motion.div
        initial={{ x: "-100%" }}
        animate={{ x: isOpen ? "0%" : "-100%" }}
        transition={{ type: "spring", damping: 18, stiffness: 320, mass: 0.65 }}
        className={cn(
          "fixed left-0 z-50 panel-solid border-r border-border shadow-2xl",
          "w-full sm:w-96 lg:w-80 xl:w-96",
          "flex flex-col overflow-hidden"
        )}
        style={{
          top: `calc(env(safe-area-inset-top, 0px) + ${isAdminBannerActive ? 'var(--admin-banner-height, 0px)' : '0px'})`,
          height: `calc(100vh - env(safe-area-inset-top, 0px) - ${isAdminBannerActive ? 'var(--admin-banner-height, 0px)' : '0px'})`,
        }}
      >
        {/* Internal wrapper with conditional padding for desktop traffic lights */}
        <div className="flex flex-col h-full" style={{ paddingTop: isStandaloneApp ? '30px' : undefined }}>
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border bg-background">
            <button
              onClick={() => onTabChange("history")}
              className={cn(
                "text-sm font-semibold transition-colors",
                activeTab === "quote" ? "text-muted-foreground hover:text-foreground cursor-pointer" : "text-foreground cursor-default"
              )}
            >
              Chat History
            </button>
            <div className="flex items-center gap-2">
              {activeTab === "quote" ? (
                <>
                  <Button
                    onClick={() => onTabChange("history")}
                    variant="ghost"
                    size="sm"
                    className="h-9 px-3 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  >
                    <ChevronLeft className="h-3.5 w-3.5 mr-1.5" /> Back
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onClose}
                    className="ml-1 rounded-full bg-muted/50 hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    onClick={() => onTabChange("quote")}
                    className={cn(
                      "h-9 px-3 rounded-lg text-xs font-medium transition-all bg-muted/50 text-foreground hover:bg-muted hover:text-primary"
                    )}
                  >
                    <Quote className="h-3.5 w-3.5 mr-1.5" /> Daily Quote
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onClose}
                    className="ml-1 rounded-full bg-muted/50 hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden">
            <AnimatePresence mode="wait">
              {activeTab === "history" && (
                <motion.div key="history" initial={{ opacity: 0, x: -20, scale: 0.95 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 20, scale: 0.95 }} transition={{ type: "spring", damping: 20, stiffness: 300, mass: 0.8 }} className="h-full">
                  <ChatHistoryPanel />
                </motion.div>
              )}

              {activeTab === "quote" && (
                <motion.div key="quote" initial={{ opacity: 0, x: -20, scale: 0.95 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 20, scale: 0.95 }} transition={{ type: "spring", damping: 20, stiffness: 300, mass: 0.8 }} className="h-full">
                  <QuotePanel />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Upgrade Banner for free users */}
          {!isSubscribed && (
            <div className="p-3 border-t border-border">
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('open-upgrade-modal'))}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-gradient-to-r from-blue-600/10 to-cyan-600/10 border border-cyan-500/20 hover:border-cyan-500/40 transition-all group"
              >
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-600/20">
                  <Crown className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold text-foreground">Upgrade to Pro</p>
                  <p className="text-xs text-muted-foreground">Unlimited messages & more</p>
                </div>
                <span className="text-xs font-bold text-cyan-400 group-hover:text-cyan-300 transition-colors">$8/mo</span>
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}
