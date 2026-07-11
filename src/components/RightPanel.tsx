import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
  Check,
  Palette,
  Share2,
  CircleGauge,
} from "lucide-react";
import { useCorporateModeStore } from "@/store/useCorporateModeStore";
import { useAccentStore, type AccentColor } from "@/store/useAccentStore";
import { useAccentColor } from "@/hooks/useAccentColor";
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
import { shouldReserveDesktopTrafficLightSpace } from "@/utils/platform";
import { useAdminBanner } from "@/components/AdminBanner";
import { useAdminSettings } from "@/hooks/useAdminSettings";
import { isMobileLocalDevice } from "@/utils/mobileLocal";
import { useSubscription } from "@/hooks/useSubscription";

export type RightPanelTab = "history" | "quote" | "settings";

// Quick accent-color swatches for the overflow menu (matches Settings → Appearance)
const ACCENT_SWATCHES: { id: AccentColor; label: string; gradient: string; adminOnly?: boolean }[] = [
  { id: "red",    label: "Red",    gradient: "linear-gradient(135deg, hsl(0,90%,48%), hsl(0,90%,58%))" },
  { id: "blue",   label: "Blue",   gradient: "linear-gradient(135deg, hsl(205,100%,48%), hsl(205,95%,58%))" },
  { id: "green",  label: "Green",  gradient: "linear-gradient(135deg, hsl(145,82%,35%), hsl(145,80%,45%))" },
  { id: "yellow", label: "Yellow", gradient: "linear-gradient(135deg, hsl(45,100%,48%), hsl(45,100%,58%))" },
  { id: "purple", label: "Purple", gradient: "linear-gradient(135deg, hsl(268,85%,52%), hsl(268,82%,62%))" },
  { id: "orange", label: "Orange", gradient: "linear-gradient(135deg, hsl(22,100%,50%), hsl(22,98%,60%))" },
  { id: "noir",   label: "Noir",   gradient: "linear-gradient(135deg, hsl(0,0%,4%), hsl(0,0%,18%))" },
  { id: "gold",   label: "Gold",   gradient: "linear-gradient(135deg, hsl(40,78%,42%), hsl(46,92%,64%) 50%, hsl(43,82%,48%))", adminOnly: true },
];

interface RightPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: RightPanelTab;
  onTabChange: (tab: RightPanelTab) => void;
  isDocked?: boolean;
  onToggleDock?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  canShareChat?: boolean;
  onShareChat?: () => void;
  canShowUsage?: boolean;
  onOpenUsage?: () => void;
  usageTitle?: string;
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
  canShareChat = false,
  onShareChat,
  canShowUsage = false,
  onOpenUsage,
  usageTitle = "Usage limits",
}: RightPanelProps) {
  const [isStandaloneApp, setIsStandaloneApp] = useState(false);
  const isAdminBannerActive = useAdminBanner();
  const navigate = useNavigate();
  const corporateMode = useCorporateModeStore((s) => s.enabled);
  const setCorporate = useCorporateModeStore((s) => s.setEnabled);
  const accent = useAccentStore((s) => s.accentColor);
  const { setAccentColor } = useAccentColor();
  const { isAdmin } = useAdminSettings();
  const accentSwatches = ACCENT_SWATCHES.filter((s) => !s.adminOnly || isAdmin);
  const themeMode = useAccentStore((s) => s.themeMode);
  const cycleThemeMode = useAccentStore((s) => s.cycleThemeMode);
  const ThemeIcon = themeMode === "light" ? Sun : themeMode === "system" ? Monitor : Moon;
  const themeLabel = themeMode === "light" ? "Light" : themeMode === "system" ? "System" : "Dark";

  const { selectedModelId, status: localStatus } = useLocalAIStore();
  const { toast } = useToast();
  const isMobileLocal = isMobileLocalDevice();
  const { hasBoost, openCheckout } = useSubscription();

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
    setIsStandaloneApp(shouldReserveDesktopTrafficLightSpace());
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
          isOpen ? "pointer-events-auto" : "pointer-events-none"
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

            {/* Overflow menu — Corporate Mode + theme + accent colors */}
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
                {!isMobileLocal && (
                  <>
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
                  </>
                )}

                <DropdownMenuLabel className="text-xs text-muted-foreground">Theme</DropdownMenuLabel>
                <DropdownMenuItem onClick={cycleThemeMode} className="gap-2 cursor-pointer">
                  <ThemeIcon className="h-4 w-4" />
                  <span className="text-sm">Theme: {themeLabel}</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground">Accent color</DropdownMenuLabel>
                <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                  {accentSwatches.map((opt) => {
                    const isActive = accent === opt.id;
                    return (
                      <button
                        key={opt.id}
                        onClick={(e) => {
                          e.preventDefault();
                          setAccentColor(opt.id);
                        }}
                        title={opt.label}
                        aria-label={`Select ${opt.label} accent color`}
                        className={cn(
                          "relative h-6 w-6 rounded-full transition-transform",
                          opt.id === "noir" && "accent-swatch-noir",
                          isActive ? "ring-2 ring-offset-1 ring-offset-popover ring-primary scale-110" : "hover:scale-110",
                        )}
                        style={opt.id === "noir" ? undefined : { background: opt.gradient }}
                      >
                        {isActive && (
                          <Check className="absolute inset-0 m-auto h-3.5 w-3.5 text-white drop-shadow" />
                        )}
                      </button>
                    );
                  })}
                </div>

                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => navigate("/dashboard/settings?section=appearance")}
                  className="gap-2 cursor-pointer"
                >
                  <Palette className="h-4 w-4" />
                  <span className="text-sm">Appearance settings</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {(canShareChat || canShowUsage) && (
            <div className="px-3 py-2 border-b border-border/40">
              <div className="grid grid-cols-2 gap-2">
                {canShareChat && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onShareChat}
                    className="h-9 justify-start gap-2 rounded-xl bg-muted/30 hover:bg-primary/10 hover:text-primary"
                  >
                    <Share2 className="h-4 w-4" />
                    <span className="text-xs font-semibold">Share</span>
                  </Button>
                )}
                {canShowUsage && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onOpenUsage}
                    title={usageTitle}
                    className="h-9 justify-start gap-2 rounded-xl bg-muted/30 hover:bg-primary/10 hover:text-primary"
                  >
                    <CircleGauge className="h-4 w-4" />
                    <span className="text-xs font-semibold">Usage</span>
                  </Button>
                )}
              </div>
            </div>
          )}

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

          {!hasBoost && (
            <div className="p-4 border-t border-border/50 bg-primary/5">
              <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-background/50 p-3.5 backdrop-blur-md">
                {/* Decorative glow */}
                <div className="absolute -right-8 -top-8 w-24 h-24 bg-primary/10 rounded-full blur-xl pointer-events-none" />
                
                <div className="flex items-start gap-3">
                  <div className="inline-flex items-center justify-center p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                    <Crown className="h-4.5 w-4.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-foreground">Upgrade to Boost</h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                      Unlock unlimited GPT-5.6 Sol frontier reasoning and custom web publishing.
                    </p>
                  </div>
                </div>
                
                <Button 
                  onClick={() => openCheckout()}
                  className="w-full mt-3 h-8 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-md transition-all"
                >
                  Upgrade to Boost
                </Button>
              </div>
            </div>
          )}

        </div>
      </motion.div>
    </>
  );
}
