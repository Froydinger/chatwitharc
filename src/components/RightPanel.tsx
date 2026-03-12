import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { X, History, Image, LayoutGrid, Crown, Quote, Layers, Rocket } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { ChatHistoryPanel } from "@/components/ChatHistoryPanel";
import { MediaLibraryPanel } from "@/components/MediaLibraryPanel";
import { CanvasesPanel } from "@/components/CanvasesPanel";
import { AppsPanel } from "@/components/AppsPanel";
import { QuotePanel } from "@/components/QuotePanel";
import { cn } from "@/lib/utils";
import { useAdminBanner } from "@/components/AdminBanner";
import { useSubscription } from "@/hooks/useSubscription";

export type RightPanelTab = "history" | "media" | "canvases" | "apps" | "quote" | "settings";

interface RightPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: RightPanelTab;
  onTabChange: (tab: RightPanelTab) => void;
}

export function RightPanel({ isOpen, onClose, activeTab, onTabChange }: RightPanelProps) {
  const navigate = useNavigate();
  // Detect PWA/Electron mode for conditional spacing
  const [isStandaloneApp, setIsStandaloneApp] = useState(false);
  const isAdminBannerActive = useAdminBanner();
  const { isSubscribed } = useSubscription();

  // Map sidebar tabs to dashboard routes
  const dashboardTabMap: Partial<Record<RightPanelTab, string>> = {
    history: "/dashboard?tab=chats",
    media: "/dashboard?tab=images",
    apps: "/dashboard?tab=apps",
  };

  useEffect(() => {
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || 
                  (window.navigator as any).standalone === true;
    const isElectron = /electron/i.test(navigator.userAgent);
    const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || 
                           (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);
    setIsStandaloneApp((isPWA || isElectron) && !isMobileDevice);
  }, []);

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
          <div className="relative flex items-center gap-1.5 flex-1">
            {/* Deterministic bubble indicator — no layoutId */}
            <motion.div
              className="absolute h-10 w-10 rounded-full bg-primary/20 ring-1 ring-primary pointer-events-none"
              animate={{
                left: (() => {
                  const tabs = ["history", "media", "canvases", "apps", "quote"];
                  return tabs.indexOf(activeTab) * 46;
                })(),
              }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            />
            {[
              { key: "history" as const, icon: History, label: "History" },
              { key: "media" as const, icon: Image, label: "Media" },
              { key: "canvases" as const, icon: Layers, label: "Canvases" },
              { key: "apps" as const, icon: Rocket, label: "Apps" },
              { key: "quote" as const, icon: Quote, label: "Quote" },
            ].map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => {
                  const dashboardRoute = dashboardTabMap[key];
                  if (dashboardRoute) {
                    navigate(dashboardRoute);
                    onClose();
                  } else {
                    onTabChange(key);
                  }
                }}
                title={label}
                className={cn(
                  "relative z-10 h-10 w-10 rounded-full flex items-center justify-center transition-colors touch-manipulation active:scale-95",
                  activeTab === key ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
          
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="ml-2 rounded-full bg-muted/50 hover:bg-destructive/10 hover:text-destructive"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden">
          <Tabs value={activeTab} className="h-full">
            <AnimatePresence mode="wait">
              {activeTab === "canvases" && (
                <TabsContent value="canvases" className="h-full m-0" asChild>
                  <motion.div key="canvases" initial={{ opacity: 0, x: -20, scale: 0.95 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 20, scale: 0.95 }} transition={{ type: "spring", damping: 20, stiffness: 300, mass: 0.8 }} className="h-full">
                    <CanvasesPanel />
                  </motion.div>
                </TabsContent>
              )}

              {activeTab === "apps" && (
                <TabsContent value="apps" className="h-full m-0" asChild>
                  <motion.div key="apps" initial={{ opacity: 0, x: -20, scale: 0.95 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 20, scale: 0.95 }} transition={{ type: "spring", damping: 20, stiffness: 300, mass: 0.8 }} className="h-full">
                    <AppsPanel />
                  </motion.div>
                </TabsContent>
              )}

              {activeTab === "media" && (
                <TabsContent value="media" className="h-full m-0" asChild>
                  <motion.div key="media" initial={{ opacity: 0, x: -20, scale: 0.95 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 20, scale: 0.95 }} transition={{ type: "spring", damping: 20, stiffness: 300, mass: 0.8 }} className="h-full">
                    <MediaLibraryPanel />
                  </motion.div>
                </TabsContent>
              )}

              {activeTab === "history" && (
                <TabsContent value="history" className="h-full m-0" asChild>
                  <motion.div key="history" initial={{ opacity: 0, x: -20, scale: 0.95 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 20, scale: 0.95 }} transition={{ type: "spring", damping: 20, stiffness: 300, mass: 0.8 }} className="h-full">
                    <ChatHistoryPanel />
                  </motion.div>
                </TabsContent>
              )}

              {activeTab === "quote" && (
                <TabsContent value="quote" className="h-full m-0" asChild>
                  <motion.div key="quote" initial={{ opacity: 0, x: -20, scale: 0.95 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 20, scale: 0.95 }} transition={{ type: "spring", damping: 20, stiffness: 300, mass: 0.8 }} className="h-full">
                    <QuotePanel />
                  </motion.div>
                </TabsContent>
              )}
            </AnimatePresence>
            </Tabs>
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
