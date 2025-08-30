import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useArcStore } from "@/store/useArcStore";
import { BottomNavigation } from "@/components/BottomNavigation";
import { ChatInterface } from "@/components/ChatInterface";
// import { VoiceInterface } from "@/components/VoiceInterface"; // Voice logic preserved
import { SettingsPanel } from "@/components/SettingsPanel";

import { ChatHistoryPanel } from "@/components/ChatHistoryPanel";
import { ApiKeyModal } from "@/components/ApiKeyModal";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";

const Index = () => {
  const { currentTab, apiKey, theme } = useArcStore();
  const [showApiModal, setShowApiModal] = useState(false);

  // Check for API key on first load
  useEffect(() => {
    if (!apiKey) {
      const timer = setTimeout(() => {
        setShowApiModal(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [apiKey]);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.className = theme;
  }, [theme]);

  const renderCurrentTab = () => {
    switch (currentTab) {
      case 'chat':
        return <ChatInterface />;
      case 'history':
        return <ChatHistoryPanel />;
      case 'settings':
        return <SettingsPanel />;
      default:
        return <ChatInterface />;
    }
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background Effects */}
      <div className="fixed inset-0 pointer-events-none">
        <motion.div
          animate={{
            background: [
              "radial-gradient(circle at 20% 50%, hsl(var(--primary-glow) / 0.1) 0%, transparent 50%)",
              "radial-gradient(circle at 80% 20%, hsl(var(--primary-glow) / 0.1) 0%, transparent 50%)",
              "radial-gradient(circle at 40% 80%, hsl(var(--primary-glow) / 0.1) 0%, transparent 50%)"
            ]
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
          className="w-full h-full"
        />
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex flex-col min-h-screen">
        <main className="flex-1 flex items-center justify-center p-4 pb-24">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentTab}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className="w-full h-full flex items-center justify-center"
            >
              {renderCurrentTab()}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Bottom Navigation */}
        <BottomNavigation />
      </div>

      {/* API Key Modal */}
      <ApiKeyModal 
        isOpen={showApiModal} 
        onClose={() => setShowApiModal(false)} 
      />

      {/* PWA Install Prompt */}
      <PWAInstallPrompt />
    </div>
  );
};

export default Index;
