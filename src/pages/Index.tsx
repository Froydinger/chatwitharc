import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { useChatSync } from "@/hooks/useChatSync";
import { useArcStore } from "@/store/useArcStore";
import { NamePrompt } from "@/components/NamePrompt";
import { MobileChatApp } from "@/components/MobileChatApp";
import { OnboardingScreen } from "@/components/OnboardingScreen";
import { LandingScreen } from "@/components/LandingScreen";

export function Index() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user, loading, needsOnboarding } = useAuth();
  const { isLoaded } = useChatSync();
  const { currentSessionId, loadSession, chatSessions } = useArcStore();

  const [onboardingComplete, setOnboardingComplete] = useState(false);

  // Ensure theme-ready class is set
  useEffect(() => {
    if (!loading) {
      document.documentElement.classList.add('theme-ready');
    }
  }, [loading]);

  // Force dark mode for landing page when not authenticated
  useEffect(() => {
    if (!user && !loading) {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
    }
  }, [user, loading]);

  // Load session from URL if present (priority: URL takes precedence)
  useEffect(() => {
    if (!user || !isLoaded) return;

    if (sessionId) {
      const sessionExists = chatSessions.find(s => s.id === sessionId);
      if (sessionExists && currentSessionId !== sessionId) {
        loadSession(sessionId);
      } else if (!sessionExists) {
        console.warn('Session from URL not found:', sessionId);
        navigate('/', { replace: true });
      }
    }
  }, [sessionId, user, chatSessions, currentSessionId, isLoaded]);

  // Initialize theme on app load
  useEffect(() => {}, []);

  // Handle pending prompt from landing screen after authentication
  useEffect(() => {
    if (user && !loading && !needsOnboarding) {
      const pendingPrompt = sessionStorage.getItem('pending-prompt');
      if (pendingPrompt) {
        sessionStorage.removeItem('pending-prompt');
        useArcStore.getState().startChatWithMessage(pendingPrompt);
      }
    }
  }, [user, loading, needsOnboarding]);

  // Only show loading screen during auth, never during chat switches
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-pulse flex justify-center mb-4">
            <img
              src="/arc-logo-ui.png"
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

  // Authenticated user - show chat
  return <MobileChatApp />;
}
