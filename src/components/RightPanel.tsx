import { useState, useEffect } from "react";
import { X, History, Image, LayoutGrid, Settings } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChatHistoryPanel } from "@/components/ChatHistoryPanel";
import { SettingsPanel } from "@/components/SettingsPanel";
import { MediaLibraryPanel } from "@/components/MediaLibraryPanel";
import { CanvasesPanel } from "@/components/CanvasesPanel";
import { cn } from "@/lib/utils";
import { useAdminBanner } from "@/components/AdminBanner";

interface RightPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: "history" | "media" | "apps" | "settings";
  onTabChange: (tab: "history" | "media" | "apps" | "settings") => void;
}

export function RightPanel({ isOpen, onClose, activeTab, onTabChange }: RightPanelProps) {
  // Detect PWA/Electron mode for conditional spacing
  const [isStandaloneApp, setIsStandaloneApp] = useState(false);
  const isAdminBannerActive = useAdminBanner();

  useEffect(() => {
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || 
                  (window.navigator as any).standalone === true;
    const isElectron = /electron/i.test(navigator.userAgent);
    setIsStandaloneApp(isPWA || isElectron);
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
          top: isAdminBannerActive ? 'var(--admin-banner-height, 0px)' : '0px',
          height: isAdminBannerActive ? 'calc(100vh - var(--admin-banner-height, 0px))' : '100vh'
        }}
      >
        {/* Internal wrapper with conditional padding */}
        <div className={cn(
          "flex flex-col h-full",
          isStandaloneApp && "md:pt-[30px]"
        )}>
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border bg-background">
          <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as any)} className="flex-1">
            <TabsList className="grid w-full grid-cols-4 bg-muted/50 rounded-full">
              <TabsTrigger value="history" className="flex items-center justify-center rounded-full data-[state=active]:!bg-primary/20 data-[state=active]:text-primary data-[state=active]:ring-1 data-[state=active]:ring-primary">
                <History className="h-4 w-4" />
              </TabsTrigger>
              <TabsTrigger value="media" className="flex items-center justify-center rounded-full data-[state=active]:!bg-primary/20 data-[state=active]:text-primary data-[state=active]:ring-1 data-[state=active]:ring-primary">
                <Image className="h-4 w-4" />
              </TabsTrigger>
              <TabsTrigger value="apps" className="flex items-center justify-center rounded-full data-[state=active]:!bg-primary/20 data-[state=active]:text-primary data-[state=active]:ring-1 data-[state=active]:ring-primary">
                <LayoutGrid className="h-4 w-4" />
              </TabsTrigger>
              <TabsTrigger value="settings" className="flex items-center justify-center rounded-full data-[state=active]:!bg-primary/20 data-[state=active]:text-primary data-[state=active]:ring-1 data-[state=active]:ring-primary">
                <Settings className="h-4 w-4" />
              </TabsTrigger>
            </TabsList>
          </Tabs>
          
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
              {activeTab === "settings" && (
                <TabsContent value="settings" className="h-full m-0" asChild>
                  <motion.div
                    key="settings"
                    initial={{ opacity: 0, x: -20, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 20, scale: 0.95 }}
                    transition={{ type: "spring", damping: 20, stiffness: 300, mass: 0.8 }}
                    className="h-full"
                  >
                    <SettingsPanel />
                  </motion.div>
                </TabsContent>
              )}

              {activeTab === "apps" && (
                <TabsContent value="apps" className="h-full m-0" asChild>
                  <motion.div
                    key="apps"
                    initial={{ opacity: 0, x: -20, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 20, scale: 0.95 }}
                    transition={{ type: "spring", damping: 20, stiffness: 300, mass: 0.8 }}
                    className="h-full"
                  >
                    <CanvasesPanel />
                  </motion.div>
                </TabsContent>
              )}

              {activeTab === "media" && (
                <TabsContent value="media" className="h-full m-0" asChild>
                  <motion.div
                    key="media"
                    initial={{ opacity: 0, x: -20, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 20, scale: 0.95 }}
                    transition={{ type: "spring", damping: 20, stiffness: 300, mass: 0.8 }}
                    className="h-full"
                  >
                    <MediaLibraryPanel />
                  </motion.div>
                </TabsContent>
              )}

              {activeTab === "history" && (
                <TabsContent value="history" className="h-full m-0" asChild>
                  <motion.div
                    key="history"
                    initial={{ opacity: 0, x: -20, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 20, scale: 0.95 }}
                    transition={{ type: "spring", damping: 20, stiffness: 300, mass: 0.8 }}
                    className="h-full"
                  >
                    <ChatHistoryPanel />
                  </motion.div>
                </TabsContent>
              )}
            </AnimatePresence>
            </Tabs>
          </div>
        </div>
      </motion.div>
    </>
  );
}
