import { BoostIcon } from '@/components/BoostIcon';
import { ConditionalTransition } from "@/components/transitions/ConditionalTransition";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  X,
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
  Palette,
  Share2,
  CircleGauge,
} from "lucide-react";
import { useCorporateModeStore } from "@/store/useCorporateModeStore";
import { useAccentStore } from "@/store/useAccentStore";
import { useLocalAIStore } from "@/store/useLocalAIStore";
import { useArcStore } from "@/store/useArcStore";
import { useToast } from "@/hooks/use-toast";
import { Transition } from "@/components/transitions/Transition";
import { SequencedTransition } from "@/components/transitions/SequencedTransition";
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
import { isMobileLocalDevice } from "@/utils/mobileLocal";
import { useSubscription } from "@/hooks/useSubscription";

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
  const themeMode = useAccentStore((s) => s.themeMode);
  const cycleThemeMode = useAccentStore((s) => s.cycleThemeMode);
  const ThemeIcon = themeMode === "light" ? Sun : themeMode === "system" ? Monitor : Moon;
  const themeLabel = themeMode === "light" ? "Light" : themeMode === "system" ? "System" : "Dark";

  const { selectedModelId, status: localStatus } = useLocalAIStore();
  const { toast } = useToast();
  const isMobileLocal = isMobileLocalDevice();
  const { hasBoost, isAdmin, openCheckout } = useSubscription();

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
        <ConditionalTransition preset="fade">{isOpen && (
          <div
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 lg:hidden"
            onClick={onClose}
          />
        )}</ConditionalTransition>

      {/* Panel */}
      <div
        data-open={isOpen}
        aria-hidden={!isOpen}
        {...(!isOpen ? { inert: "" } : {})}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        className={cn(
          "arc-history-drawer fixed left-0 z-50 panel-solid border-r border-border/60 shadow-2xl",
          "w-full sm:w-[22rem] lg:w-[20rem] xl:w-[22rem]",
          "flex flex-col overflow-hidden",
          isOpen ? "pointer-events-auto" : "pointer-events-none"
        )}
        style={{
          top: `calc(var(--arcai-safe-area-top) + ${
            isAdminBannerActive ? "var(--admin-banner-height, 0px)" : "0px"
          })`,
          height: `calc(100vh - var(--arcai-safe-area-top) - ${
            isAdminBannerActive ? "var(--admin-banner-height, 0px)" : "0px"
          })`,
        }}
      >
        <div
          className="flex flex-col h-full"
          style={{ paddingTop: isStandaloneApp ? "var(--arcai-desktop-titlebar-safe-area, 30px)" : undefined }}
        >
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
              <Transition key={themeMode} preset="text"><span className="inline-flex">
                <ThemeIcon className="h-4 w-4" />
              </span></Transition>
            </Button>

            {/* Overflow menu — Corporate Mode and theme */}
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
              <div className={cn("grid gap-2", canShareChat && canShowUsage ? "grid-cols-2" : "grid-cols-1")}>
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
            <SequencedTransition contentKey={activeTab} className="h-full">
              {activeTab === "history" ? <ChatHistoryPanel /> : activeTab === "quote" ? <QuotePanel /> : null}
            </SequencedTransition>
          </div>

          {!hasBoost && (
            <div className="p-4 border-t border-border/50 bg-primary/5">
              <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-background/50 p-3.5 backdrop-blur-md">
                {/* Decorative glow */}
                <div className="absolute -right-8 -top-8 w-24 h-24 bg-primary/10 rounded-full blur-xl pointer-events-none" />
                
                <div className="flex items-start gap-3">
                  <div className="inline-flex items-center justify-center p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                    <BoostIcon hasBoost={hasBoost || isAdmin} className="h-4.5 w-4.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-foreground">Upgrade to Boost</h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                      Unlock unlimited Deep Search, higher usage limits, and premium creative tools.
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
      </div>
    </>
  );
}
