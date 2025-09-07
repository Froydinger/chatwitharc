import { useEffect, useState } from "react";
import { useArcStore } from "@/store/useArcStore";
import { useAuth } from "@/hooks/useAuth";
import { useChatSync } from "@/hooks/useChatSync";
import { NamePrompt } from "@/components/NamePrompt";
import { AppLayout } from "@/components/AppLayout";
import { ChatInterface } from "@/components/ChatInterface";
import { ChatHistoryPanel } from "@/components/ChatHistoryPanel";
import { SettingsPanel } from "@/components/SettingsPanel";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { OnboardingScreen } from "@/components/OnboardingScreen";
import { AuthPage } from "@/components/AuthPage";
import { SyncStatus } from "@/components/SyncStatus";

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
            <img src="/lovable-uploads/72a60af7-4760-4f2e-9000-1ca90800ae61.png" alt="ArcAI" className="h-12 w-12" />
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
    <AppLayout>
      <div className="h-full flex flex-col">
        {/* Background Pattern */}
        <div className="fixed inset-0 pointer-events-none opacity-[0.02]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,hsl(var(--primary))_0%,transparent_70%)]" />
        </div>

        {/* Content */}
        <div className="relative flex-1 p-6">
          {renderCurrentTab()}
        </div>
      </div>

      {/* PWA Install Prompt */}
      <PWAInstallPrompt />
      
      {/* Sync Status Indicator */}
      <SyncStatus />
    </AppLayout>
  );
}