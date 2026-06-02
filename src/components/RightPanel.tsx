import { useState, useEffect } from "react";
import { X, Crown, Quote, ChevronLeft, Lock, Unlock, Pin, PinOff, Moon, Sun, Monitor } from "lucide-react";
import { useCorporateModeStore } from "@/store/useCorporateModeStore";
import { useAccentStore } from "@/store/useAccentStore";
import { useLocalAIStore } from "@/store/useLocalAIStore";
import { useArcStore } from "@/store/useArcStore";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ChatHistoryPanel } from "@/components/ChatHistoryPanel";
import { QuotePanel } from "@/components/QuotePanel";
import { cn } from "@/lib/utils";
import { useAdminBanner } from "@/components/AdminBanner";
import { useSubscription } from "@/hooks/useSubscription";
import { isMobileLocalDevice } from "@/utils/mobileLocal";

export type RightPanelTab = "history" | "quote" | "settings";

interface RightPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: RightPanelTab;
  onTabChange: (tab: RightPanelTab) => void;
  isDocked?: boolean;
  onToggleDock?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function RightPanel({ isOpen, onClose, activeTab, onTabChange, isDocked = true, onToggleDock, onMouseEnter, onMouseLeave }: RightPanelProps) {
  // Detect PWA/Electron mode for conditional spacing
  const [isStandaloneApp, setIsStandaloneApp] = useState(false);
  const isAdminBannerActive = useAdminBanner();
  const { isSubscribed } = useSubscription();
  const corporateMode = useCorporateModeStore((s) => s.enabled);
  const setCorporate = useCorporateModeStore((s) => s.setEnabled);
  const accent = useAccentStore((s) => s.accentColor);
  const themeMode = useAccentStore((s) => s.themeMode);
  const cycleThemeMode = useAccentStore((s) => s.cycleThemeMode);
  const ThemeIcon = themeMode === "light" ? Sun : themeMode === "system" ? Monitor : Moon;
  const themeLabel = themeMode === "light" ? "Light mode (tap for system)" : themeMode === "system" ? "System mode (tap for dark)" : "Dark mode (tap for light)";

  const { selectedModelId, status: localStatus } = useLocalAIStore();
  const { toast } = useToast();
  const isMobileLocal = isMobileLocalDevice();

  const handleToggleCorporate = () => {
    if (isMobileLocal) return;
    const next = !corporateMode;
    const { isLoading, isGeneratingImage, messages, createNewSession } = useArcStore.getState();
    if (isLoading || isGeneratingImage) {
      toast({
        title: "Finish the current message first",
        description: "Wait for the response to complete before switching modes.",
        variant: "destructive",
      });
      return;
    }
    if (next && !(selectedModelId && localStatus === "ready")) {
      setCorporate(true, accent);
      toast({
        title: "Download a local model first",
        description: "Corporate Mode needs an on-device model. Open Settings → Arc Local to pick one.",
      });
      return;
    }
    setCorporate(next, accent);
    // Histories diverge between modes — start a fresh chat if one is in progress.
    if (messages.length > 0) {
      createNewSession();
    }
    toast({
      title: next ? "Corporate Mode enabled" : "Corporate Mode disabled",
      description: next
        ? "Locked to on-device. Tools, attachments, and cloud chats are off."
        : "All features and your previous theme are back.",
    });
  };

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
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
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
          <div className="flex items-center p-2 border-b border-border bg-background">
            <div className="flex items-center w-full gap-2">
              {/* Theme cycle: dark → light → system */}
              <Button
                variant="ghost"
                size="icon"
                onClick={cycleThemeMode}
                title={themeLabel}
                aria-label={themeLabel}
                className="h-9 w-9 rounded-full bg-muted/40 hover:bg-primary/15 hover:text-primary transition-colors lg:flex-1"
              >
                <motion.span
                  key={themeMode}
                  initial={{ rotate: -90, opacity: 0, scale: 0.7 }}
                  animate={{ rotate: 0, opacity: 1, scale: 1 }}
                  transition={{ type: "spring", damping: 14, stiffness: 320 }}
                  className="inline-flex"
                >
                  <ThemeIcon className="h-4 w-4" />
                </motion.span>
              </Button>

              {activeTab === "quote" ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onTabChange("history")}
                    className="h-9 px-3 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 flex-1"
                  >
                    <ChevronLeft className="h-3.5 w-3.5 mr-1.5" /> Back
                  </Button>
                  {/* Mobile: X close button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onClose}
                    title="Close sidebar"
                    className="lg:hidden h-9 w-9 rounded-full transition-colors bg-muted/50 hover:bg-primary/15 hover:text-primary"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  {/* Desktop: Pin dock/undock button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onToggleDock ?? onClose}
                    title={isDocked ? "Undock sidebar" : "Dock sidebar"}
                    className={cn(
                      "hidden lg:flex rounded-full transition-colors flex-1",
                      isDocked
                        ? "bg-primary/15 text-primary hover:bg-primary/25"
                        : "bg-muted/50 hover:bg-primary/15 hover:text-primary"
                    )}
                  >
                    {isDocked ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    onClick={() => onTabChange("quote")}
                    className={cn(
                      "h-9 px-3 rounded-lg text-xs font-medium transition-all bg-muted/50 text-foreground hover:bg-muted hover:text-primary flex-1"
                    )}
                  >
                    <Quote className="h-3.5 w-3.5 mr-1.5" /> Daily Quote
                  </Button>
                  {!isMobileLocal && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleToggleCorporate}
                      title={corporateMode ? "Disable Corporate Mode" : "Enable Corporate Mode"}
                      aria-label={corporateMode ? "Disable Corporate Mode" : "Enable Corporate Mode"}
                      className={cn(
                        "h-9 w-9 rounded-full transition-all shrink-0",
                        corporateMode
                          ? "bg-primary/15 text-primary hover:bg-primary/25"
                          : "bg-muted/50 text-foreground hover:bg-muted hover:text-primary"
                      )}
                    >
                      {corporateMode ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                    </Button>
                  )}
                  {/* Mobile: X close button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onClose}
                    title="Close sidebar"
                    className="lg:hidden h-9 w-9 rounded-full transition-colors bg-muted/50 hover:bg-primary/15 hover:text-primary"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  {/* Desktop: Pin dock/undock button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onToggleDock ?? onClose}
                    title={isDocked ? "Undock sidebar" : "Dock sidebar"}
                    className={cn(
                      "hidden lg:flex rounded-full transition-colors flex-1",
                      isDocked
                        ? "bg-primary/15 text-primary hover:bg-primary/25"
                        : "bg-muted/50 hover:bg-primary/15 hover:text-primary"
                    )}
                  >
                    {isDocked ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
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
                <span className="text-xs font-bold text-cyan-400 group-hover:text-cyan-300 transition-colors">$12/mo</span>
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}
