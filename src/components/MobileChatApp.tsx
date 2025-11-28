import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Menu, Sun, Moon, ArrowDown, X, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useArcStore } from "@/store/useArcStore";
import { MessageBubble } from "@/components/MessageBubble";
import { ChatInput, cancelCurrentRequest } from "@/components/ChatInput";
import { RightPanel } from "@/components/RightPanel";
import { WelcomeSection } from "@/components/WelcomeSection";
import { ThinkingIndicator } from "@/components/ThinkingIndicator";
import { ThemedLogo } from "@/components/ThemedLogo";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useProfile } from "@/hooks/useProfile";
import { useTheme } from "@/hooks/useTheme";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { getAllPromptsFlat } from "@/utils/promptGenerator";
import { usePromptPreload } from "@/hooks/usePromptPreload";

/** Snarky Arc greetings - no names, just pure personality */
function getDaypartGreeting(d: Date = new Date()): string {
  const h = d.getHours();

  const morningGreetings = [
    "Good morning.",
    "Rise and shine.",
    "Arc and shine.",
    "Wakey wakey.",
    "Morning, sunshine.",
    "You're up early.",
    "Bright and early, huh?",
    "Coffee time?",
    "Let's make today count.",
    "Fresh start incoming.",
    "New day, new arc.",
    "Ready to crush it?",
    "Time to be productive.",
    "The early bird gets the arc.",
    "Let's arc this day.",
    "Morning magic awaits.",
    "What are we building today?",
    "Another day, another arc.",
    "The world is your canvas.",
    "Let's get after it.",
    "Time to make things happen.",
  ];

  const afternoonGreetings = [
    "Good afternoon.",
    "Hey there.",
    "Still going strong?",
    "Arc o'clock.",
    "Midday vibes.",
    "Hope you're crushing it.",
    "Afternoon energy.",
    "Peak productivity hours.",
    "Let's keep the momentum.",
    "Halfway through the day.",
    "What are we working on?",
    "Time flies when you're arcing.",
    "Staying focused?",
    "Power through mode activated.",
    "Coffee break or hustle?",
    "The grind continues.",
    "Making progress?",
    "Keep that flow going.",
    "Afternoon excellence.",
    "Let's finish strong.",
    "Ideas flowing?",
  ];

  const eveningGreetings = [
    "Good evening.",
    "Hey night owl.",
    "Arc after dark.",
    "Burning the midnight oil?",
    "Late night energy.",
    "The night is young.",
    "Still at it?",
    "Evening grind.",
    "Moon's out, arc's out.",
    "Peak creative hours.",
    "Night mode activated.",
    "When everyone sleeps, you arc.",
    "Quiet hours, best hours.",
    "The evening shift.",
    "Late night brilliance.",
    "After hours excellence.",
    "Productivity knows no bedtime.",
    "Working late or starting early?",
    "Night time, right time.",
    "Dark mode detected.",
    "Let's make tonight count.",
  ];

  let greetings: string[];
  if (h >= 5 && h < 12) {
    greetings = morningGreetings;
  } else if (h >= 12 && h < 18) {
    greetings = afternoonGreetings;
  } else {
    greetings = eveningGreetings;
  }

  // Pick a random greeting using current timestamp for better randomization
  const randomIndex = Math.floor((Math.random() * 1000 + Date.now()) % greetings.length);
  return greetings[randomIndex];
}

/** Keep header logo as-is */
const HEADER_LOGO = "/arc-logo-ui.png";

export function MobileChatApp() {
  const navigate = useNavigate();
  const {
    messages,
    isLoading,
    isGeneratingImage,
    isSearchingChats,
    isAccessingMemory,
    isSwitchingChat,
    createNewSession,
    startChatWithMessage,
    currentSessionId,
    chatSessions,
    rightPanelOpen,
    setRightPanelOpen,
    rightPanelTab,
    setRightPanelTab,
    syncFromSupabase,
  } = useArcStore();
  const { profile } = useProfile();
  const isMobile = useIsMobile(); // This hook determines if the current device is mobile

  // Pre-generate prompts in background for instant access
  usePromptPreload();

  // Initialize session model to Smart & Fast on mount (resets on refresh)
  useEffect(() => {
    // Only set if not already set - this ensures it defaults to Smart & Fast on refresh
    // but preserves user changes during the session
    if (!sessionStorage.getItem('arc_session_model')) {
      sessionStorage.setItem('arc_session_model', 'google/gemini-2.5-flash');
    }
  }, []);

  // Track if running as PWA or Electron app
  const [isPWAMode, setIsPWAMode] = useState(false);
  const [isElectronApp, setIsElectronApp] = useState(false);

  useEffect(() => {
    const checkPWA = window.matchMedia('(display-mode: standalone)').matches || 
                     (window.navigator as any).standalone === true;
    const checkElectron = /electron/i.test(navigator.userAgent);
    setIsPWAMode(checkPWA);
    setIsElectronApp(checkElectron);
  }, []);

  // Initialize rightPanelOpen state based on device type and user's last preference
  useEffect(() => {
    // Check window width for large screens (1024px+) - these should have persistent sidebar
    const isLargeScreen = window.innerWidth >= 1024;

    if (isLargeScreen) {
      // On large screens, always keep sidebar open by default
      const userPreference = localStorage.getItem("arc_rightPanelOpen");
      // Default to open on large screens, unless user explicitly closed it
      if (userPreference === null || userPreference === "true") {
        if (!rightPanelOpen) {
          setRightPanelOpen(true);
        }
      }
    } else if (isMobile) {
      // Always close on mobile/tablet by default
      if (rightPanelOpen) {
        setRightPanelOpen(false);
      }
    }
  }, [isMobile]); // Only run on mount and when isMobile changes

  // Effect to save user's preference to localStorage whenever rightPanelOpen changes
  useEffect(() => {
    localStorage.setItem("arc_rightPanelOpen", String(rightPanelOpen));
  }, [rightPanelOpen]);

  const [dragOver, setDragOver] = useState(false);
  const [hasSelectedImages, setHasSelectedImages] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [isPullingToRefresh, setIsPullingToRefresh] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [snarkyMessage, setSnarkyMessage] = useState<string | null>(null);
  const [isLogoSpinning, setIsLogoSpinning] = useState(false);
  const snarkyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Scroll container for messages
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Fixed input dock measurement
  const inputDockRef = useRef<HTMLDivElement>(null);
  const [inputHeight, setInputHeight] = useState<number>(96);
  const lastLoadedMessageIdRef = useRef<string | null>(null);
  const { toast } = useToast();

  // Snarky greeting - no names, just personality
  const [greeting, setGreeting] = useState(getDaypartGreeting());

  // Update greeting every minute
  useEffect(() => {
    const id = setInterval(() => setGreeting(getDaypartGreeting()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Update greeting when starting a new chat
  useEffect(() => {
    if (!currentSessionId || messages.length === 0) {
      setGreeting(getDaypartGreeting());
    }
  }, [currentSessionId]);

  // Sync URL with current session - only update URL when explicitly creating/switching sessions
  useEffect(() => {
    // Only navigate if we have a current session and we're on the home page
    if (currentSessionId && window.location.pathname === "/") {
      navigate(`/chat/${currentSessionId}`, { replace: true });
    }
    // Note: navigate is a stable function reference from React Router and doesn't need to be in deps
    // Adding it causes infinite loops (SecurityError: history.replaceState called >100 times)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSessionId]);

  // Track the last message ID when loading a session to prevent typewriter animation on old messages
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      // Only update if we don't have a tracked ID yet, or if we're loading a different session
      if (lastLoadedMessageIdRef.current === null) {
        lastLoadedMessageIdRef.current = lastMessage.id;
      }
    }
  }, [currentSessionId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      // Check if this is a new message we haven't seen before
      if (lastLoadedMessageIdRef.current !== lastMessage.id) {
        // Immediate scroll for new messages
        scrollToBottom();
      }
    }
  }, [messages]);

  // Scroll during typewriter typing - buttery smooth
  useEffect(() => {
    let rafId: number | null = null;

    const handleTyping = () => {
      const el = messagesContainerRef.current;
      if (!el) return;

      // Cancel any pending animation frame
      if (rafId) {
        cancelAnimationFrame(rafId);
      }

      // Use requestAnimationFrame for smoother scroll
      rafId = requestAnimationFrame(() => {
        const target = el.scrollHeight;
        const current = el.scrollTop;
        const maxScroll = el.scrollHeight - el.clientHeight;

        // Only scroll if we're near the bottom (within 100px) or already at bottom
        if (maxScroll - current < 200) {
          el.scrollTo({
            top: el.scrollHeight,
            behavior: "smooth",
          });
        }
        rafId = null;
      });
    };

    window.addEventListener("typewriter-typing", handleTyping);
    return () => {
      window.removeEventListener("typewriter-typing", handleTyping);
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }, []);

  // Clear the tracked ID when messages change (new message added)
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      // If the last message is different from what we tracked, it's a new message
      if (lastLoadedMessageIdRef.current !== lastMessage.id) {
        // Don't update the ref immediately - this allows the new message to animate
        const timer = setTimeout(() => {
          lastLoadedMessageIdRef.current = lastMessage.id;
        }, 100);
        return () => clearTimeout(timer);
      }
    }
  }, [messages]);

  // Quick Prompts - 6 Chat, 6 Create, 6 Write, 6 Code (memoized to prevent re-renders)
  // Generate fresh prompts on each component mount (site load)
  const quickPrompts = useMemo(
    () => getAllPromptsFlat(),
    [], // Empty dependency array means this generates once per component mount
  );

  // Show/hide scroll button based on scroll position
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;

    const handleScroll = () => {
      const currentScrollY = el.scrollTop;
      const isScrollable = el.scrollHeight > el.clientHeight;
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;

      // Only show button if content is scrollable, not near bottom, and has messages
      setShowScrollButton(isScrollable && !isNearBottom && messages.length > 0);

      // Hide header when scrolling down, show when scrolling up (MOBILE ONLY)
      if (isMobile) {
        if (currentScrollY > lastScrollY && currentScrollY > 1500) {
          // Scrolling down & past threshold (about 2 page lengths)
          setHeaderVisible(false);
        } else if (currentScrollY < lastScrollY) {
          // Scrolling up
          setHeaderVisible(true);
        }
      }

      setLastScrollY(currentScrollY);
    };

    el.addEventListener("scroll", handleScroll);

    // Also check on mount and when messages change
    handleScroll();

    return () => el.removeEventListener("scroll", handleScroll);
  }, [messages.length, lastScrollY, isMobile]);

  const scrollToBottom = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: "smooth",
    });
  };

  // Measure input dock height
  useEffect(() => {
    const update = () => inputDockRef.current && setInputHeight(inputDockRef.current.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    if (inputDockRef.current) ro.observe(inputDockRef.current);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      ro.disconnect();
    };
  }, []);

  // Pull-to-refresh for mobile
  useEffect(() => {
    if (!isMobile) return;

    const el = messagesContainerRef.current;
    if (!el) return;

    let startY = 0;
    let pulling = false;

    const handleTouchStart = (e: TouchEvent) => {
      if (el.scrollTop === 0) {
        startY = e.touches[0].clientY;
        pulling = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!pulling) return;

      const currentY = e.touches[0].clientY;
      const distance = currentY - startY;

      if (distance > 0 && el.scrollTop === 0) {
        e.preventDefault();
        const maxPull = 80;
        const adjustedDistance = Math.min(distance * 0.5, maxPull);
        setPullDistance(adjustedDistance);
        setIsPullingToRefresh(adjustedDistance > 60);
      }
    };

    const handleTouchEnd = async () => {
      if (isPullingToRefresh) {
        setIsSyncing(true);
        try {
          await syncFromSupabase();
          toast({
            title: "Synced",
            description: "Chat history updated",
          });
        } catch {
          toast({
            title: "Sync failed",
            variant: "destructive",
          });
        } finally {
          setIsSyncing(false);
        }
      }

      setPullDistance(0);
      setIsPullingToRefresh(false);
      pulling = false;
      startY = 0;
    };

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd);

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isMobile, isPullingToRefresh, syncFromSupabase, toast]);

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await syncFromSupabase();
      toast({
        title: "Synced",
        description: "Chat history updated",
      });
    } catch {
      toast({
        title: "Sync failed",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleNewChat = () => {
    const newSessionId = createNewSession();
    navigate(`/chat/${newSessionId}`);

    // Reset model to Smart & Fast for new chat (session only)
    sessionStorage.setItem("arc_session_model", "google/gemini-2.5-flash");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const triggerPrompt = useCallback(
    (prompt: string) => {
      startChatWithMessage(prompt);
      // When triggering a prompt, respecting existing sidebar visibility seems appropriate
    },
    [startChatWithMessage],
  );

  /** AI avatar progressive fade in after load */
  useEffect(() => {
    const root = messagesContainerRef.current ?? document.body;
    const tagCandidate = (img: HTMLImageElement) => {
      const alt = (img.getAttribute("alt") || "").toLowerCase();
      const likely =
        img.hasAttribute("data-ai-avatar") ||
        img.classList.contains("ai-avatar") ||
        alt.includes("arc") ||
        alt.includes("assistant") ||
        alt.includes("arcai");
      if (likely) {
        img.classList.add("ai-avatar");
        img.classList.remove("is-loaded");
        const markLoaded = () => img.classList.add("is-loaded");
        if (img.complete && img.naturalWidth > 0) markLoaded();
        else {
          img.addEventListener("load", markLoaded, { once: true });
          img.addEventListener("error", markLoaded, { once: true });
        }
      }
    };
    const scan = () => root.querySelectorAll("img").forEach((n) => tagCandidate(n as HTMLImageElement));
    scan();
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        m.addedNodes.forEach((n) => {
          if (n instanceof HTMLImageElement) tagCandidate(n);
          else if (n instanceof HTMLElement)
            n.querySelectorAll("img").forEach((img) => tagCandidate(img as HTMLImageElement));
        });
      }
    });
    mo.observe(root, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);

  // Main chat interface
  return (
    <div className={cn(
      "min-h-screen bg-background flex relative",
      (isPWAMode || isElectronApp) && "md:pt-[30px]"
    )}>
      {/* Breathing gradient background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="chat-breathing-blob chat-breathing-blob-1"></div>
        <div className="chat-breathing-blob chat-breathing-blob-2"></div>
      </div>

      {/* Main Content */}
      <div
        className={cn(
          "flex-1 flex flex-col transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] relative z-10",
          rightPanelOpen && "lg:ml-80 xl:ml-96",
        )}
      >
        {/* Floating header buttons - no bar */}
        <div
          className={cn(
            "fixed left-0 right-0 z-40 transition-transform duration-300 ease-out pointer-events-none",
            (isPWAMode || isElectronApp) ? "top-0 md:top-[30px]" : "top-0",
            isMobile && !headerVisible && "-translate-y-full"
          )}
        >
          <div className="flex h-16 items-center justify-between px-4 pt-2 pointer-events-none">
            {/* Left-side buttons */}
            <div className="flex items-center gap-2 pointer-events-auto">
              <motion.div whileHover={{ scale: 1.1, y: -2 }} whileTap={{ scale: 0.95 }} transition={{ type: "spring", damping: 15, stiffness: 300 }}>
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-full backdrop-blur-2xl bg-background/60 border-border/30 hover:bg-background/80 transition-all shadow-lg"
                  onClick={() => {
                    setRightPanelOpen(!rightPanelOpen);
                  }}
                >
                  <Menu className="h-4 w-4" />
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.1, y: -2 }} whileTap={{ scale: 0.95 }} transition={{ type: "spring", damping: 15, stiffness: 300 }}>
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-full backdrop-blur-2xl bg-background/60 border-border/30 hover:bg-background/80 transition-all shadow-lg"
                  onClick={handleNewChat}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </motion.div>
            </div>

            {/* Snarky message bubble - fixed position */}
            <AnimatePresence mode="wait">
              {snarkyMessage && (
                <motion.div
                  key={snarkyMessage}
                  initial={{ opacity: 0, y: -10, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.9 }}
                  transition={{ type: "spring", damping: 20, stiffness: 300 }}
                  className="fixed top-20 right-4 px-3 py-2 rounded-xl backdrop-blur-2xl bg-background/95 border border-border/40 shadow-xl z-50 max-w-[220px]"
                >
                  <p className="text-[10pt] text-foreground/90 leading-snug">{snarkyMessage}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Logo Orb - clickable with snarky messages */}
            <motion.div
              className="relative pointer-events-auto"
              whileHover={{ scale: 1.1, rotate: 5 }}
              whileTap={{ scale: 0.95 }}
              animate={isLogoSpinning ? { rotate: 360 } : { rotate: 0 }}
              transition={isLogoSpinning ? { duration: 0.6, ease: "easeOut" } : { type: "spring", damping: 15, stiffness: 300 }}
            >
              <Button
                variant="outline"
                size="icon"
                className="rounded-full backdrop-blur-2xl bg-background/60 border-border/30 hover:bg-background/80 transition-all overflow-hidden shadow-lg"
                onClick={() => {
                  // Clear any existing timeout
                  if (snarkyTimeoutRef.current) {
                    clearTimeout(snarkyTimeoutRef.current);
                  }

                  // Trigger spin animation
                  setIsLogoSpinning(true);
                  setTimeout(() => setIsLogoSpinning(false), 600);

                  const snarkyMessages = [
                    "I'm an Arc, not a miracle worker.",
                    "Still better than a straight line.",
                    "Bending over backwards for you... literally.",
                    "An Arc in the dark is still an Arc.",
                    "Going full circle? That's a different shape.",
                    "Arc you serious right now?",
                    "I've got Range. Get it? Arc range?",
                    "Curving expectations since forever.",
                    "Not all heroes are straight... lines.",
                    "Arc-ing up for another day of this.",
                    "Mathematically superior to lines.",
                    "I've seen some angles in my time.",
                    "Peak performance. Literally.",
                    "The curve is the path to enlightenment.",
                    "Straight lines are so last century.",
                    "Arc-ane knowledge at your service.",
                    "Riding the curve of innovation.",
                    "I put the 'arc' in 'arc-hitecture'.",
                    "No straight answers here, only curves.",
                    "Bending the rules, one degree at a time.",
                    "Circumference? More like circum-friends.",
                    "I'm on a trajectory to greatness.",
                    "Curveball specialist.",
                    "The scenic route is always better.",
                    "I don't do linear thinking.",
                    "Arc responsibly.",
                    "Angles fear me. Curves respect me.",
                    "I'm well-rounded, unlike those lines.",
                    "Taking the high road... literally arcing.",
                    "Every journey has its ups and downs. I'm both.",
                  ];
                  const randomMessage = snarkyMessages[Math.floor(Math.random() * snarkyMessages.length)];
                  setSnarkyMessage(randomMessage);

                  // Set new timeout and store reference
                  snarkyTimeoutRef.current = setTimeout(() => {
                    setSnarkyMessage(null);
                    snarkyTimeoutRef.current = null;
                  }, 3000);
                }}
                title="Click for Arc wisdom"
              >
                <ThemedLogo className="h-9 w-9" alt="Arc" />
              </Button>
            </motion.div>
          </div>
        </div>

        {/* Scrollable messages layer with bottom padding equal to dock height */}
        <div
          className={cn("relative flex-1 transition-all duration-300 ease-out", dragOver && "bg-primary/5")}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          {/* Chat Messages */}
          <div
            ref={messagesContainerRef}
            className="absolute inset-x-0 bottom-0 top-0 overflow-y-auto"
            style={{ paddingBottom: `calc(${inputHeight}px + env(safe-area-inset-bottom, 0px) + 6rem)` }}
          >
            {/* Pull-to-refresh indicator (mobile only) */}
            {isMobile && pullDistance > 0 && (
              <div
                className="absolute top-0 left-0 right-0 flex justify-center items-center transition-opacity"
                style={{
                  height: pullDistance,
                  opacity: Math.min(pullDistance / 60, 1),
                }}
              >
                <RefreshCw
                  className={cn(
                    "h-5 w-5 text-primary transition-transform",
                    isPullingToRefresh && "rotate-180",
                    isSyncing && "animate-spin",
                  )}
                />
              </div>
            )}

            {/* Empty state */}
            {messages.length === 0 ? (
              <div style={{ paddingTop: "3rem" }}>
                <WelcomeSection
                  greeting={greeting}
                  heroAvatar={null}
                  quickPrompts={quickPrompts}
                  onTriggerPrompt={triggerPrompt}
                  profile={profile}
                  chatSessions={chatSessions}
                  isLoading={isLoading}
                  isGeneratingImage={isGeneratingImage}
                />
              </div>
            ) : isSwitchingChat ? (
              // Show loader during chat switch
              <div className="w-full flex justify-center items-center" style={{ paddingTop: "10rem" }}>
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.15 }}
                  className="flex flex-col items-center gap-3"
                >
                  <div className="relative">
                    <div className="h-8 w-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                  </div>
                  <p className="text-sm text-muted-foreground">Loading chat...</p>
                </motion.div>
              </div>
            ) : (
              <motion.div
                className="w-full flex justify-center px-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              >
                <div
                  className="space-y-4 chat-messages w-full max-w-xl" // Messages only, now max-w-xl
                  style={{
                    paddingTop: "6.5rem",
                  }}
                >
                  <AnimatePresence mode="sync" initial={false}>
                    {messages.map((message, index) => {
                      const isLastAssistantMessage = message.role === "assistant" && index === messages.length - 1;
                      // Only animate if this is a new message (not loaded from history)
                      const shouldAnimateTypewriter =
                        isLastAssistantMessage && message.id !== lastLoadedMessageIdRef.current;

                      return (
                        <motion.div
                          key={message.id}
                          initial={{ opacity: 0, y: 12, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -8, scale: 0.98 }}
                          transition={{
                            duration: 0.35,
                            ease: [0.25, 0.1, 0.25, 1],
                            scale: { duration: 0.25 }
                          }}
                        >
                          <MessageBubble
                            message={message}
                            isLatestAssistant={isLastAssistantMessage}
                            shouldAnimateTypewriter={shouldAnimateTypewriter}
                            isThinking={isLastAssistantMessage && isLoading && !isGeneratingImage}
                            onEdit={async (messageId: string, newContent: string) => {
                              const chatInputEvent = new CustomEvent("processEditedMessage", {
                                detail: { content: newContent, editedMessageId: messageId },
                              });
                              window.dispatchEvent(chatInputEvent);
                            }}
                          />
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                  {/* Show thinking indicator when loading */}
                  <AnimatePresence>
                    {isLoading &&
                      !isGeneratingImage &&
                      messages.length > 0 &&
                      messages[messages.length - 1]?.role === "user" && (
                        <motion.div
                          initial={{ opacity: 0, y: 12, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -8, scale: 0.98 }}
                          transition={{
                            duration: 0.35,
                            ease: [0.25, 0.1, 0.25, 1],
                            scale: { duration: 0.25 }
                          }}
                        >
                          <ThinkingIndicator
                            isLoading={isLoading}
                            isGeneratingImage={false}
                            searchingChats={isSearchingChats}
                            accessingMemory={isAccessingMemory}
                          />
                        </motion.div>
                      )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </div>

          {/* Scroll to bottom button */}
          <AnimatePresence>
            {showScrollButton && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="fixed bottom-32 left-[45%] -translate-x-1/2 z-40 pointer-events-auto"
              >
                <Button
                  size="icon"
                  variant="outline"
                  className="rounded-full shadow-lg bg-background/80 backdrop-blur-sm border border-primary/20 transition-all hover:scale-105"
                  onClick={scrollToBottom}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Free-floating input shelf */}
          <div
            ref={inputDockRef}
            className="fixed bottom-6 left-0 right-0 z-30 pointer-events-none px-4"
          >
            <div className="max-w-4xl mx-auto">
              <div className="pointer-events-auto glass-dock" data-has-images={hasSelectedImages}>
                <ChatInput onImagesChange={setHasSelectedImages} rightPanelOpen={rightPanelOpen} />
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <RightPanel
          isOpen={rightPanelOpen}
          onClose={() => setRightPanelOpen(false)}
          activeTab={rightPanelTab as any}
          onTabChange={setRightPanelTab}
        />
      </div>

      {/* Scoped styles */}
      <style>{`
        /* Avatar progressive reveal */
        img.ai-avatar{
          opacity: 0;
          filter: saturate(1) contrast(1);
          transition: opacity 260ms ease, transform 260ms ease;
          transform: translateY(2px);
          will-change: opacity, transform;
        }
        img.ai-avatar.is-loaded{ opacity: 1; transform: translateY(0); }

        /* Very light floating for hero avatar */
        .floating-hero{ animation: float-3 5.2s ease-in-out infinite; }
        .assistant-hero-avatar{
          border-radius: 24%;
          box-shadow: 0 12px 30px rgba(0,0,0,0.35);
          border: none !important;
          outline: none !important;
          background: transparent;
        }
        @keyframes float-3 {
          0%,100%{transform:translate(0px,0px) rotate(0)}
          20%{transform:translate(1px,1px) rotate(0.2deg)}
          40%{transform:translate(-1px,2px) rotate(-0.3deg)}
          60%{transform:translate(2px,-1px) rotate(0.25deg)}
          80%{transform:translate(-2px,0) rotate(-0.2deg)}
        }

        /* --- PING-PONG MARQUEE (SLOW) --- */
        .marquee-ping{
          position: relative;
          overflow: hidden;
          min-height: 48px;
          -webkit-mask-image: linear-gradient(to right, transparent 0, black 10%, black 90%, transparent 100%);
                  mask-image: linear-gradient(to right, transparent 0, black 10%, black 90%, transparent 100%);
        }
        .marquee-ping-track{
          display: inline-flex;
          gap: 12px;
          white-space: nowrap;
          will-change: transform;
          transform: translate3d(0,0,0);
          animation: pingpong var(--dur, 60s) cubic-bezier(0.37, 0, 0.63, 1) infinite alternate;
          animation-delay: var(--delay, 0s);
        }
        .marquee-ping-set{ display: inline-flex; gap: 12px; }

        @keyframes pingpong{
          0%   { transform: translate3d(calc(-1 * var(--setW, 600px)), 0, 0); }
          50%  { transform: translate3d(calc(-2 * var(--setW, 600px)), 0, 0); }
          100% { transform: translate3d(0, 0, 0); }
        }

        /* Prompt pill style */
        .prompt-pill{
          pointer-events: auto;
          padding: 12px 18px;
          border-radius: 9999px;
          background: rgba(22,22,22,0.45);
          backdrop-filter: blur(8px) saturate(118%);
          -webkit-backdrop-filter: blur(8px) saturate(118%);
          border: 1px solid rgba(255,255,255,0.06);
          box-shadow:
            0 6px 16px rgba(0,0,0,0.25),
            inset 0 1px 0 rgba(255,255,255,0.04);
          transition: transform 220ms ease, background-color 220ms ease, box-shadow 220ms ease;
          white-space: nowrap;
        }
        .prompt-pill:active { transform: scale(0.98); }
        .prompt-pill:hover  { box-shadow: 0 8px 18px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.05); }

        /* Thinking indicator container */
        .thinking-shell{ transition: opacity 220ms ease, transform 220ms ease; opacity: 0; transform: translateY(3px); }
        .thinking-shell[data-show="true"]{ opacity: 1; transform: translateY(0); }

        /* The pill and its glow */
        .thinking-pill{
          position: relative;
          padding: 10px 16px;
          border-radius: 9999px;
          overflow: hidden;
          isolation: isolate;
        }
        .thinking-pill::before{
          content: ""; position: absolute; inset: 0; border-radius: inherit; z-index: -1;
          background:
            radial-gradient(80px 40px at 20% 50%, rgba(99,102,241,0.18), transparent 70%),
            radial-gradient(80px 40px at 80% 50%, rgba(16,185,129,0.16), transparent 70%),
            radial-gradient(100px 50px at 50% 0%, rgba(236,72,153,0.14), transparent 70%);
          background-repeat: no-repeat;
          filter: blur(8px);
          animation: pill-pan 12s ease-in-out infinite alternate;
        }
        .thinking-pill::after{
          content: ""; position: absolute; inset: -12%; border-radius: inherit; z-index: -2;
          background: conic-gradient(from 0deg,
            rgba(99,102,241,0.12),
            rgba(236,72,153,0.10),
            rgba(16,185,129,0.10),
            rgba(59,130,246,0.10),
            rgba(99,102,241,0.12));
          filter: blur(14px);
          animation: halo-slow 22s linear infinite;
          opacity: 0.85;
        }
        @keyframes pill-pan{ 0%{ transform: translate3d(-2px,0,0) } 100%{ transform: translate3d(2px,0,0) } }
        @keyframes halo-slow{ from { transform: rotate(0deg) } to { transform: rotate(360deg) } }

        /* Bounce + sparkle */
        @keyframes bounce-slow { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-2px)} }
        .animate-bounce-slow{ animation: bounce-slow 1.2s ease-in-out infinite; }
        @keyframes twinkle { 0%,100%{transform:scale(0.9) rotate(0); opacity:0.85} 50%{transform:scale(1.05) rotate(8deg); opacity:1} }
        .animate-twinkle{ animation: twinkle 1.6s ease-in-out infinite; }

        /* Subtle glass bubbles for message area */
        .chat-messages .surface,
        .chat-messages .card,
        .chat-messages [data-bubble],
        .chat-messages [class*="bubble"]{
          border-radius: 18px !important;
          background: rgba(18,18,18,0.42) !important;
          backdrop-filter: blur(8px) saturate(118%) !important;
          -webkit-backdrop-filter: blur(8px) saturate(118%) !important;
          border: 1px solid rgba(255,255,255,0.06) !important;
          box-shadow:
            0 2px 10px rgba(0,0,0,0.22),
            inset 0 1.5px 0 rgba(255,255,255,0.08),
            inset 0 1px 0 rgba(255,255,255,0.04) !important;
        }

        /* —— Minimal Luxe Input Bar —— */
        .glass-dock{
          position: relative;
          margin: 0 auto;
          max-width: 760px;
          padding: 10px;
          border-radius: 9999px;
          overflow: visible;
          background: color-mix(in oklab, hsl(var(--background)) 82%, transparent);
          border: 1px solid color-mix(in oklab, hsl(var(--border)) 35%, transparent);
        }
        .dark .glass-dock{
          background: color-mix(in oklab, hsl(var(--background)) 60%, transparent);
          backdrop-filter: blur(24px) saturate(115%);
          -webkit-backdrop-filter: blur(24px) saturate(115%);
          border: 1px solid color-mix(in oklab, hsl(var(--border)) 30%, transparent);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
         }
        .glass-dock::before{ display: none; }
        .glass-dock:hover{ transform: none; transition: none; }
        .dark .glass-dock:focus-within{ 
          background: color-mix(in oklab, hsl(var(--background)) 60%, transparent); 
          box-shadow: 
            0 8px 32px rgba(0, 0, 0, 0.3),
            inset 0 0 0 1px hsl(var(--primary) / 0.3),
            inset 0 0 20px hsl(var(--primary) / 0.12);
        }

        /* Hide button borders inside dark mode input bar for unified appearance */
        .dark .glass-dock button{ border-color: transparent !important; }
        .dark .glass-dock .ci-menu-btn{ background: rgba(255, 255, 255, 0.05) !important; }
        .dark .glass-dock button:hover:not(:disabled){ background: rgba(255, 255, 255, 0.08) !important; }

        /* Remove textarea background to prevent layered rectangle appearance */
        .dark .glass-dock textarea{ background: transparent !important; border-radius: 0 !important; }
        .glass-dock > *{ position: relative; z-index: 1; }
        .glass-dock :is(.input-wrapper,.input-container,.chat-input,form){ background: transparent !important; border: 0 !important; box-shadow: none !important; }
        .glass-dock .chat-input-halo{
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
        }
        .glass-dock textarea{ outline: none !important; box-shadow: none !important; }

        /* Preview styles (used by ChatInput) */
        .ci-preview{ background: color-mix(in oklab, hsl(var(--background)) 70%, transparent); border: 1px solid color-mix(in oklab, hsl(var(--border)) 35%, transparent); border-radius: 16px; }
        .ci-thumb{ width: 56px; height: 56px; border-radius: 9999px; object-fit: cover; }

        @media (max-width: 480px){ .glass-dock{ padding: 8px; max-width: 92vw; } .glass-dock .chat-input-halo{ padding: 6px 8px !important; } }
        @media (prefers-reduced-motion: reduce){ .glass-dock, .glass-dock:hover{ transition: none !important; transform: none !important; } }
      `}</style>
    </div>
  );
}
