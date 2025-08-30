import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useArcStore } from "@/store/useArcStore";
import { useAuth } from "@/hooks/useAuth";
import { useChatSync } from "@/hooks/useChatSync";
import { BottomNavigation } from "@/components/BottomNavigation";
import { ChatInterface } from "@/components/ChatInterface";
import { SettingsPanel } from "@/components/SettingsPanel";
import { ChatHistoryPanel } from "@/components/ChatHistoryPanel";
import { ApiKeyModal } from "@/components/ApiKeyModal";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { AuthPage } from "@/components/AuthPage";
import { OnboardingScreen } from "@/components/OnboardingScreen";

const Index = () => {
  const { currentTab, apiKey, theme } = useArcStore();
  const { user, loading, needsOnboarding } = useAuth();
  const [showApiModal, setShowApiModal] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(false);

  // Initialize chat sync hook
  useChatSync();

  // Check for API key on first load (only for authenticated users)
  useEffect(() => {
    if (user && !apiKey) {
      const timer = setTimeout(() => {
        setShowApiModal(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [user, apiKey]);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.className = theme;
  }, [theme]);

  // Show loading screen while checking auth
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.div
          animate={{ rotate: [0, 5, -5, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <img src="/lovable-uploads/307f07e3-5431-499e-90f8-7b51837059a7.png" alt="ArcAI" className="h-16 w-16" />
        </motion.div>
      </div>
    );
  }

  // Show auth page if user is not authenticated
  if (!user) {
    return <AuthPage />;
  }

  // Show onboarding if user needs it and hasn't completed it
  if (needsOnboarding && !onboardingComplete) {
    return <OnboardingScreen onComplete={() => setOnboardingComplete(true)} />;
  }

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

      {/* Main Container - accounts for bottom navigation */}
      <div className="relative z-10 h-screen flex flex-col">
        <main className="flex-1 overflow-hidden">
          {/* Scrollable content container */}
          <div className="h-full overflow-y-auto pb-32">
            <div className="min-h-full p-2 sm:p-4 lg:p-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentTab}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                  className="w-full"
                >
                  {renderCurrentTab()}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
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
