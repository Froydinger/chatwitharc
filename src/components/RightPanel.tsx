import { useState, useEffect } from "react";
import {
  X,
  Crown,
  Quote,
  Lock,
  Unlock,
  Pin,
  PinOff,
  Moon,
  Sun,
  Monitor,
  MoreHorizontal,
  MessageSquare,
} from "lucide-react";
import { useCorporateModeStore } from "@/store/useCorporateModeStore";
import { useAccentStore } from "@/store/useAccentStore";
import { useLocalAIStore } from "@/store/useLocalAIStore";
import { useArcStore } from "@/store/useArcStore";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
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

export function RightPanel({
  isOpen,
  onClose,
  activeTab,
  onTabChange,
  isDocked = true,
  onToggleDock,
  onMouseEnter,
  onMouseLeave,
}: RightPanelProps) {
  const [isStandaloneApp, setIsStandaloneApp] = useState(false);
  const isAdminBannerActive = useAdminBanner();
  const { isSubscribed } = useSubscription();
  const corporateMode = useCorporateModeStore((s) => s.enabled);
  const setCorporate = useCorporateModeStore((s) => s.setEnabled);
  const accent = useAccentStore((s) => s.accentColor);
  const themeMode = useAccentStore((s) => s.themeMode);
  const cycleThemeMode = useAccentStore((s) => s.cycleThemeMode);
  const ThemeIcon = themeMode === "light" ? Sun : themeMode === "system" ? Monitor : Moon;
  const themeLabel = themeMode === "light" ? "Light" : themeMode === "system" ? "System" : "Dark";

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
    if (messages.length > 0) createNewSession();
    toast({
      title: next ? "Corporate Mode enabled" : "Corporate Mode disabled",
      description: next
        ? "Locked to on-device. Tools, attachments, and cloud chats are off."
        : "All features and your previous theme are back.",
    });
  };

  useEffect(() => {
    const isPWA =
      window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone === true;
    const isElectron = /electron/i.test(navigator.userAgent);
    const isMobileDevice =
      /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
      (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
    setIsStandaloneApp((isPWA || isElectron) && !isMobileDevice);
  }, []);

  useEffect(() => {
    if (isOpen) onTabChange("history");
  }, [isOpen, onTabChange]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  const DockOrClose = (
    <>
      {/* Mobile: X */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onClose}
        title="Close"
        className="lg:hidden h-9 w-9 rounded-full bg-muted/40 hover:bg-primary/15 hover:text-primary"
      >
        <X className="h-4 w-4" />
      </Button>
      {/* Desktop: Pin / Undock */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggleDock ?? onClose}
        title={isDocked ? "Undock" : "Dock"}
        className={cn(
          "hidden lg:inline-flex h-9 w-9 rounded-full transition-colors",
          isDocked
            ? "bg-primary/15 text-primary hover:bg-primary/25"
            : "bg-muted/40 hover:bg-primary/15 hover:text-primary",
        )}
      >
        {isDocked ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
      </Button>
    </>
  );

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
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 lg:hidden"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      {/* Panel */}
      <motion.div
        initial={{ x: "-100%" }}
        animate={{ x: isOpen ? "0%" : "-100%" }}
        transition={{ type: "spring", damping: 20, stiffness: 320, mass: 0.6 }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        className={cn(
          "fixed left-0 z-50 panel-solid border-r border-border/60 shadow-2xl",
          "w-full sm:w-[22rem] lg:w-[20rem] xl:w-[22rem]",
          "flex flex-col overflow-hidden",
        )}
        style={{
          top: `calc(env(safe-area-inset-top, 0px) + ${
            isAdminBannerActive ? "var(--admin-banner-height, 0px)" : "0px"
          })`,
          height: `calc(100vh - env(safe-area-inset-top, 0px) - ${
            isAdminBannerActive ? "var(--admin-banner-height, 0px)" : "0px"
          })`,
        }}
      >
        <div className="flex flex-col h-full" style={{ paddingTop: isStandaloneApp ? "30px" : undefined }}>
          {/* Header — minimal: dock/close · segmented tabs · theme + overflow */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/50">
            {DockOrClose}

            {/* Segmented tab switcher (Chats / Quote) */}
            <div className="flex-1 flex items-center justify-center">
              <div className="inline-flex items-center gap-0.5 p-1 rounded-full bg-muted/40 border border-border/40 backdrop-blur-xl">
                <button
                  onClick={() => onTabChange("history")}
                  className={cn(
                    "inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-xs font-semibold transition-all",
                    activeTab === "history"
                      ? "bg-primary/60 text-primary-foreground shadow-[0_0_2px_hsl(var(--primary)/0.15)]"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Chats
                </button>
                <button
                  onClick={() => onTabChange("quote")}
                  className={cn(
                    "inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-xs font-semibold transition-all",
                    activeTab === "quote"
                      ? "bg-primary/60 text-primary-foreground shadow-[0_0_2px_hsl(var(--primary)/0.15)]"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Quote className="h-3.5 w-3.5" />
                  Quote
                </button>
              </div>
            </div>

            {/* Theme cycle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={cycleThemeMode}
              title={`Theme: ${themeLabel}`}
              aria-label={`Theme: ${themeLabel}`}
              className="h-9 w-9 rounded-full bg-muted/40 hover:bg-primary/15 hover:text-primary"
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

            {/* Overflow menu — Corporate Mode + future toggles */}
            {!isMobileLocal && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="More"
                    aria-label="More options"
                    className="h-9 w-9 rounded-full bg-muted/40 hover:bg-primary/15 hover:text-primary"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 panel-solid border-border/60">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Modes</DropdownMenuLabel>
                  <DropdownMenuItem onClick={handleToggleCorporate} className="gap-2 cursor-pointer">
                    {corporateMode ? <Lock className="h-4 w-4 text-primary" /> : <Unlock className="h-4 w-4" />}
                    <div className="flex flex-col flex-1">
                      <span className="text-sm">{corporateMode ? "Corporate Mode: On" : "Corporate Mode"}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {corporateMode ? "On-device only" : "Lock to on-device model"}
                      </span>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={cycleThemeMode} className="gap-2 cursor-pointer">
                    <ThemeIcon className="h-4 w-4" />
                    <span className="text-sm">Theme: {themeLabel}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden">
            <AnimatePresence mode="wait">
              {activeTab === "history" && (
                <motion.div
                  key="history"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12 }}
                  transition={{
                    type: "spring",
                    damping: 22,
                    stiffness: 320,
                  }}
                  className="h-full"
                >
                  <ChatHistoryPanel />
                </motion.div>
              )}

              {activeTab === "quote" && (
                <motion.div
                  key="quote"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12 }}
                  transition={{
                    type: "spring",
                    damping: 22,
                    stiffness: 320,
                  }}
                  className="h-full"
                >
                  <QuotePanel />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Upgrade banner */}
          {!isSubscribed && (
            <div className="p-3 border-t border-border/50">
              <button
                onClick={() => window.dispatchEvent(new CustomEvent("open-upgrade-modal"))}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-gradient-to-r from-primary/15 to-primary/5 border border-primary/25 hover:border-primary/50 transition-all group"
              >
                <div className="p-1.5 rounded-lg bg-primary/20">
                  <Crown className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-semibold text-foreground">Upgrade to Pro</p>
                  <p className="text-[11px] text-muted-foreground truncate">Unlimited messages & more</p>
                </div>
                <span className="text-xs font-bold text-primary">$12/mo</span>
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}
