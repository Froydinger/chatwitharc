import { useState, useEffect } from "react";
import { X, History, Headphones } from "lucide-react";
import { Settings } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChatHistoryPanel } from "@/components/ChatHistoryPanel";
import { SettingsPanel } from "@/components/SettingsPanel";
import { MusicPlayerPanel } from "@/components/MusicPlayerPanel";
import { cn } from "@/lib/utils";

interface RightPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: "history" | "music" | "settings";
  onTabChange: (tab: "history" | "music" | "settings") => void;
}

export function RightPanel({ isOpen, onClose, activeTab, onTabChange }: RightPanelProps) {
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
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      {/* Panel */}
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: isOpen ? "0%" : "100%" }}
        transition={{ type: "tween", duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        className={cn(
          "fixed top-0 right-0 h-full z-50 bg-background border-l border-border/40",
          "w-full sm:w-96 lg:w-80 xl:w-96",
          "flex flex-col overflow-hidden"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/40 bg-background/95 backdrop-blur">
          <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as any)} className="flex-1">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="history" className="flex items-center gap-2">
                <History className="h-4 w-4" />
                <span className="hidden sm:inline">History</span>
              </TabsTrigger>
              <TabsTrigger value="music" className="flex items-center gap-2">
                <Headphones className="h-4 w-4" />
                <span className="hidden sm:inline">Music</span>
              </TabsTrigger>
              <TabsTrigger value="settings" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline">Settings</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="ml-2 rounded-full"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          <Tabs value={activeTab} className="h-full">
            <TabsContent value="history" className="h-full m-0">
              <ChatHistoryPanel />
            </TabsContent>
            
            <TabsContent value="music" className="h-full m-0">
              <MusicPlayerPanel />
            </TabsContent>
            
            <TabsContent value="settings" className="h-full m-0">
              <SettingsPanel />
            </TabsContent>
          </Tabs>
        </div>
      </motion.div>
    </>
  );
}