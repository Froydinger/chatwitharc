import { useEffect, useState } from "react";
import { Navigate, useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { useChatSync } from "@/hooks/useChatSync";
import { useArcStore } from "@/store/useArcStore";
import { NamePrompt } from "@/components/NamePrompt";
import { MobileChatApp } from "@/components/MobileChatApp";
import { OnboardingScreen } from "@/components/OnboardingScreen";

export function Index() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user, profile, loading, needsOnboarding, isAnonymous } = useAuth();
  const { isLoaded } = useChatSync();
  const { currentSessionId, loadSession, chatSessions } = useArcStore();

  const [onboardingComplete, setOnboardingComplete] = useState(false);

  // Ensure theme-ready class is set
  useEffect(() => {
    if (!loading) {
      document.documentElement.classList.add('theme-ready');
    }
  }, [loading]);

  // Load session from URL if present (priority: URL takes precedence)
  useEffect(() => {
    if (!user || !isLoaded) return;

    if (sessionId) {
      const sessionExists = chatSessions.find(s => s.id === sessionId);
      if (sessionExists && currentSessionId !== sessionId) {
        loadSession(sessionId);
      } else if (!sessionExists && currentSessionId !== sessionId) {
        console.warn('Session from URL not found:', sessionId);
        navigate('/', { replace: true });
      }
    }
  }, [sessionId, user, chatSessions, currentSessionId, isLoaded, loadSession, navigate]);

  // Handle pending prompt from previous flows after authentication
  useEffect(() => {
    if (user && !loading && !needsOnboarding) {
      const pendingPrompt = sessionStorage.getItem('pending-prompt');
      if (pendingPrompt) {
        sessionStorage.removeItem('pending-prompt');
        useArcStore.getState().startChatWithMessage(pendingPrompt);
      }
    }
  }, [user, loading, needsOnboarding]);

  // Only show loading screen during initial auth bootstrap
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

  // Show onboarding only for real (non-anonymous) users who need it.
  if (user && !isAnonymous && needsOnboarding && !onboardingComplete) {
    return (
      <OnboardingScreen
        onComplete={() => {
          setOnboardingComplete(true);
        }}
      />
    );
  }

  // No guest chat screens. Signed-out or anonymous visitors always see the lander.
  if (!user || isAnonymous) {
    return <Navigate to="/" replace />;
  }

  return <MobileChatApp />;
}
