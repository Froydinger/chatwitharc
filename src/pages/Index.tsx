import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useArcStore } from "@/store/useArcStore";
import { useAuth } from "@/hooks/useAuth";
import { NamePrompt } from "@/components/NamePrompt";
import { BottomNavigation } from "@/components/BottomNavigation";
import { ChatInterface } from "@/components/ChatInterface";
import { SettingsPanel } from "@/components/SettingsPanel";
import { ChatHistoryPanel } from "@/components/ChatHistoryPanel";
import { VoiceInterface } from "@/components/VoiceInterface";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { OnboardingScreen } from "@/components/OnboardingScreen";
import { AuthPage } from "@/components/AuthPage";

export function Index() {
  const { currentTab } = useArcStore();
  const { user, loading, needsOnboarding } = useAuth();
  
  const [onboardingComplete, setOnboardingComplete] = useState(false);

  // Force dark mode
  useEffect(() => {
    document.documentElement.className = 'dark';
  }, []);

  // Show name prompt for users without display name
  if (user && needsOnboarding) {
    return <NamePrompt />;
  }

  if (loading) return null;

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
            {/* Smoother content transitions - removed extra scroll container */}
            <AnimatePresence mode="wait">
              <motion.div
                key={currentTab}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="h-full"
              >
                {renderCurrentTab()}
              </motion.div>
            </AnimatePresence>
          </main>

        {/* Bottom Navigation */}
        <BottomNavigation />
      </div>

      {/* PWA Install Prompt */}
      <PWAInstallPrompt />
    </div>
  );
}