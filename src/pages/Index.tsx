import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { useChatSync } from "@/hooks/useChatSync";
import { useArcStore } from "@/store/useArcStore";
import { NamePrompt } from "@/components/NamePrompt";
import { MobileChatApp } from "@/components/MobileChatApp";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { OnboardingScreen } from "@/components/OnboardingScreen";
import { LandingScreen } from "@/components/LandingScreen";

export function Index() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user, loading, needsOnboarding } = useAuth();
  const { isLoaded } = useChatSync();
  const { theme } = useTheme();
  const { currentSessionId, loadSession, chatSessions } = useArcStore();

  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  // Mark initial load as complete once data is loaded
  useEffect(() => {
    if (user && isLoaded && !initialLoadComplete) {
      setInitialLoadComplete(true);
    }
  }, [user, isLoaded, initialLoadComplete]);

  // Load session from URL if present
  useEffect(() => {
    if (sessionId && user && isLoaded) {
      const sessionExists = chatSessions.find(s => s.id === sessionId);
      if (sessionExists && currentSessionId !== sessionId) {
        loadSession(sessionId);
      } else if (!sessionExists) {
        // Session doesn't exist, redirect to home
        navigate('/', { replace: true });
      }
    }
  }, [sessionId, user, isLoaded, chatSessions, currentSessionId, loadSession, navigate]);

  // Initialize theme on app load
  useEffect(() => {
    // Theme is already handled by useTheme hook
  }, []);

  // Show name prompt for users without display name
  if (user && needsOnboarding) {
    return <NamePrompt />;
  }

  // Only show loading screen on initial load, not when switching chats
  if (loading || (user && !initialLoadComplete)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-pulse flex justify-center mb-4">
            <img
              src="/arc-logo.png"
              alt="ArcAI"
              className="h-12 w-12"
            />
          </div>
          <p className="text-muted-foreground">Just a second...</p>
        </div>
      </div>
    );
  }

  // Show landing screen if user is not authenticated
  if (!user) {
    return <LandingScreen />;
  }

  // Show onboarding if user needs it and hasn't completed it
  if (needsOnboarding && !onboardingComplete) {
    return <OnboardingScreen onComplete={() => setOnboardingComplete(true)} />;
  }

  return (
    <>
      <MobileChatApp />
      <PWAInstallPrompt />
    </>
  );
}
