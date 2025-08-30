import { useEffect, useState } from "react";
import { useArcStore } from "@/store/useArcStore";
import { useAuth } from "@/hooks/useAuth";
import { useChatSync } from "@/hooks/useChatSync";
import { NamePrompt } from "@/components/NamePrompt";
import { BottomNavigation } from "@/components/BottomNavigation";
import { ChatInterface } from "@/components/ChatInterface";
import { ChatHistoryPanel } from "@/components/ChatHistoryPanel";
import { SettingsPanel } from "@/components/SettingsPanel";
import { VoiceInterface } from "@/components/VoiceInterface";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { OnboardingScreen } from "@/components/OnboardingScreen";
import { AuthPage } from "@/components/AuthPage";

export function Index() {
  const { currentTab } = useArcStore();
  const { user, loading, needsOnboarding } = useAuth();
  const { isLoaded } = useChatSync(); // Initialize chat syncing
  
  const [onboardingComplete, setOnboardingComplete] = useState(false);

  // Force dark mode
  useEffect(() => {
    document.documentElement.className = 'dark';
  }, []);

  // Show name prompt for users without display name
  if (user && needsOnboarding) {
    return <NamePrompt />;
  }

  if (loading || (user && !isLoaded)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="glass rounded-lg p-8 text-center">
          <div className="animate-pulse flex justify-center mb-4">
            <img src="/lovable-uploads/307f07e3-5431-499e-90f8-7b51837059a7.png" alt="ArcAI" className="h-12 w-12" />
          </div>
          <p className="text-muted-foreground">Loading your chats...</p>
        </div>
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
        <div className="w-full h-full bg-gradient-to-br from-primary/5 via-background to-primary-glow/5" />
      </div>

      {/* Main Container - accounts for bottom navigation */}
      <div className="relative z-10 h-screen flex flex-col">
        <main className="flex-1 overflow-hidden">
          <div className="h-full">
            {renderCurrentTab()}
          </div>
        </main>

        {/* Bottom Navigation */}
        <BottomNavigation />
      </div>

      {/* PWA Install Prompt */}
      <PWAInstallPrompt />
    </div>
  );
}