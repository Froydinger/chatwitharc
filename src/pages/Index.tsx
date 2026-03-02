import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { useChatSync } from "@/hooks/useChatSync";
import { useArcStore } from "@/store/useArcStore";
import { useGuestMode } from "@/hooks/useGuestMode";
import { NamePrompt } from "@/components/NamePrompt";
import { MobileChatApp } from "@/components/MobileChatApp";
import { OnboardingScreen } from "@/components/OnboardingScreen";
import { LandingScreen } from "@/components/LandingScreen";
import { GuestSignupPrompt } from "@/components/GuestSignupPrompt";

export function Index() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user, loading, needsOnboarding } = useAuth();
  const { isLoaded } = useChatSync();
  const { currentSessionId, loadSession, chatSessions } = useArcStore();
  const { showSignupPrompt, dismissSignupPrompt, remainingMessages, canSendMessage, recordGuestMessage, GUEST_LIMIT } = useGuestMode();

  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [guestMode, setGuestMode] = useState(false);

  // Ensure theme-ready class is set
  useEffect(() => {
    if (!loading) {
      document.documentElement.classList.add('theme-ready');
    }
  }, [loading]);

  // Force dark mode for landing page when not authenticated
  useEffect(() => {
    if (!user && !loading && !guestMode) {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
    }
  }, [user, loading, guestMode]);

  // Listen for guest message events to track count
  useEffect(() => {
    const handleGuestMessage = () => {
      if (!user && guestMode) {
        recordGuestMessage();
      }
    };
    window.addEventListener('arcai:guestMessageSent', handleGuestMessage);
    return () => window.removeEventListener('arcai:guestMessageSent', handleGuestMessage);
  }, [user, guestMode, recordGuestMessage]);

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
      setGuestMode(false);
      
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

  // Show landing screen if user is not authenticated and not in guest mode
  if (!user && !guestMode) {
    return <LandingScreen onTryAsGuest={() => setGuestMode(true)} />;
  }

  // Show onboarding if user needs it and hasn't completed it
  if (user && needsOnboarding && !onboardingComplete) {
    return <OnboardingScreen onComplete={() => setOnboardingComplete(true)} />;
  }

  // Guest mode or authenticated user - show chat
  return (
    <>
      <MobileChatApp />
      {!user && guestMode && (
        <GuestSignupPrompt
          isOpen={showSignupPrompt || !canSendMessage}
          onDismiss={dismissSignupPrompt}
          remainingMessages={remainingMessages}
          isLimitReached={!canSendMessage}
        />
      )}
      {!user && guestMode && canSendMessage && remainingMessages <= 2 && remainingMessages > 0 && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-full glass-card text-xs text-muted-foreground border border-border/30 backdrop-blur-xl">
          {remainingMessages} free chat{remainingMessages !== 1 ? 's' : ''} remaining · <button onClick={() => window.dispatchEvent(new CustomEvent('arcai:openAuth'))} className="text-primary hover:underline">Sign up free</button>
        </div>
      )}
    </>
  );
}
