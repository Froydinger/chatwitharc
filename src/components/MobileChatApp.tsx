import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Menu, Sun, Moon, ArrowDown, X, Music, MessageSquare, PenLine, MessageCircle, Brain } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { useArcStore } from "@/store/useArcStore";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useSearchStore } from "@/store/useSearchStore";
import { MessageBubble } from "@/components/MessageBubble";
import { ChatInput, cancelCurrentRequest, type ChatInputRef } from "@/components/ChatInput";
import { RightPanel } from "@/components/RightPanel";
import { WelcomeSection } from "@/components/WelcomeSection";
import { ThinkingIndicator } from "@/components/ThinkingIndicator";
import { ThemedLogo } from "@/components/ThemedLogo";
import { SupportPopup } from "@/components/SupportPopup";
import { MusicPopup } from "@/components/MusicPopup";
import { CanvasPanel } from "@/components/CanvasPanel";
import { SearchCanvas } from "@/components/SearchCanvas";
// CanvasTile removed - canvas now renders inline as chat message artifacts
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useProfile } from "@/hooks/useProfile";
import { useTheme } from "@/hooks/useTheme";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { getAllPromptsFlat } from "@/utils/promptGenerator";
import { usePromptPreload } from "@/hooks/usePromptPreload";
import { useAdminBanner } from "@/components/AdminBanner";
import { useMusicStore, musicTracks } from "@/store/useMusicStore";
import { VoiceModeOverlay } from "@/components/VoiceModeOverlay";
import { VoiceModeController } from "@/components/VoiceModeController";
import { ContextBlocksPanel } from "@/components/ContextBlocksPanel";

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
    createNewSession,
    startChatWithMessage,
    currentSessionId,
    chatSessions,
    rightPanelOpen,
    setRightPanelOpen,
    rightPanelTab,
    setRightPanelTab,
    syncFromSupabase,
    updateSessionCanvasContent,
    isHydratingSession,
  } = useArcStore();
  const { profile } = useProfile();
  const isMobile = useIsMobile();
  const isAdminBannerActive = useAdminBanner();
  
  // Canvas state (single hook call; required for correct hook initialization order)
  const {
    isOpen: isCanvasOpen,
    closeCanvas: storeCloseCanvas,
    reopenCanvas,
    openCanvas,
    hydrateFromSession,
    content: canvasContent,
  } = useCanvasStore();

  // If canvas is open on mobile, it fully takes over the UI
  const isCanvasOverlayActive = isMobile && isCanvasOpen;

  // Search mode state
  const { isOpen: isSearchOpen, closeSearch } = useSearchStore();

  // Auto-close sidebar when canvas opens on desktop
  // Reset inline styles when canvas closes (from drag-resize)
  useEffect(() => {
    if (isCanvasOpen && !isMobile && rightPanelOpen) {
      setRightPanelOpen(false);
    }
    // When canvas closes, clear any inline styles set by the resize drag handler
    if (!isCanvasOpen && inputDockRef.current) {
      inputDockRef.current.style.right = '';
    }
  }, [isCanvasOpen, isMobile]);

  // Pre-generate prompts in background for instant access
  usePromptPreload();

  // Initialize session model to Gemini 3 Flash on mount (fast chat model)
  useEffect(() => {
    // Hardcode chat model - no user selection
    sessionStorage.setItem('arc_session_model', 'google/gemini-3-flash-preview');
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

  // Listen for open-context-panel events from MemoryIndicator and settings
  useEffect(() => {
    const handler = () => setIsContextPanelOpen(true);
    window.addEventListener('open-context-panel', handler);
    window.addEventListener('open-context-blocks', handler);
    return () => {
      window.removeEventListener('open-context-panel', handler);
      window.removeEventListener('open-context-blocks', handler);
    };
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
  const [snarkyMessage, setSnarkyMessage] = useState<string | null>(null);
  const [isLogoSpinning, setIsLogoSpinning] = useState(false);
  const [isSupportPopupOpen, setIsSupportPopupOpen] = useState(false);
  const [isMusicPopupOpen, setIsMusicPopupOpen] = useState(false);
  const [isContextPanelOpen, setIsContextPanelOpen] = useState(false);
  const [showMobileCanvasInput, setShowMobileCanvasInput] = useState(false);
  const snarkyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const chatInputRef = useRef<ChatInputRef>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Music store
  const {
    isPlaying: isMusicPlaying,
    setIsPlaying: setMusicIsPlaying,
    volume: musicVolume,
    isMuted: musicMuted,
    currentTrack,
    setAudioRef,
    setCurrentTime: setMusicCurrentTime,
    setDuration: setMusicDuration,
    setIsLoading: setMusicIsLoading,
  } = useMusicStore();

  // Get current track data
  const getCurrentTrack = () => musicTracks.find(t => t.id === currentTrack) || musicTracks[0];
  const currentMusicTrack = getCurrentTrack();

  // Set audio ref in store on mount
  useEffect(() => {
    if (audioRef.current) {
      setAudioRef(audioRef.current);
    }
  }, [setAudioRef]);

  // Audio event handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = () => setMusicIsPlaying(false);
    const handleError = () => {
      setMusicIsPlaying(false);
      setMusicIsLoading(false);
    };
    const handleTimeUpdate = () => {
      setMusicCurrentTime(audio.currentTime);
    };
    const handleLoadedMetadata = () => {
      setMusicDuration(audio.duration);
      setMusicIsLoading(false);
    };
    const handleLoadStart = () => setMusicIsLoading(true);
    const handleCanPlay = () => setMusicIsLoading(false);

    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('loadstart', handleLoadStart);
    audio.addEventListener('canplay', handleCanPlay);
    audio.volume = musicMuted ? 0 : musicVolume;

    return () => {
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('loadstart', handleLoadStart);
      audio.removeEventListener('canplay', handleCanPlay);
    };
  }, [musicVolume, musicMuted, currentTrack, setMusicIsPlaying, setMusicCurrentTime, setMusicDuration, setMusicIsLoading]);

  // Scroll container for messages
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Fixed input dock measurement
  const inputDockRef = useRef<HTMLDivElement>(null);
  const [inputHeight, setInputHeight] = useState<number>(96);
  const lastLoadedMessageIdRef = useRef<string | null>(null);
  const { toast } = useToast();

  // Hydrate canvas when switching sessions
  // We use a ref to track the last hydrated session to avoid re-hydrating on chatSessions updates
  const lastHydratedSessionRef = useRef<string | null>(null);
  
  useEffect(() => {
    // Only hydrate when actually switching to a different session
    if (currentSessionId === lastHydratedSessionRef.current) return;
    lastHydratedSessionRef.current = currentSessionId;
    
    const current = currentSessionId ? chatSessions.find(s => s.id === currentSessionId) : null;
    const nextSessionCanvas = current?.canvasContent ?? '';

    // Close canvas overlay when switching sessions (prevents it from sticking)
    storeCloseCanvas();

    // Hydrate from the session's stored canvas content
    hydrateFromSession(nextSessionCanvas);
  }, [currentSessionId, chatSessions, storeCloseCanvas, hydrateFromSession]);

  // SESSION-SAFE canvas autosave: only save if we're still on the same session we hydrated
  useEffect(() => {
    if (!currentSessionId) return;
    // Only persist if we're definitely on the right session (prevents bleed on switch)
    if (currentSessionId !== lastHydratedSessionRef.current) return;

    const id = window.setTimeout(() => {
      // Double-check session hasn't changed during the debounce
      if (currentSessionId === lastHydratedSessionRef.current) {
        updateSessionCanvasContent(currentSessionId, canvasContent);
      }
    }, 650);

    return () => window.clearTimeout(id);
  }, [canvasContent, currentSessionId, updateSessionCanvasContent]);

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

  // Track session loading state to skip animations when loading old chats
  const [isSessionLoading, setIsSessionLoading] = useState(false);
  const prevSessionRef = useRef<string | null>(null);

  // Track the last message ID when loading a session to prevent typewriter animation on old messages
  useEffect(() => {
    // Detect session switch
    if (currentSessionId !== prevSessionRef.current) {
      setIsSessionLoading(true);
      // Brief delay then allow animations for new messages only
      const timer = setTimeout(() => setIsSessionLoading(false), 150);
      prevSessionRef.current = currentSessionId;
      
      // Set the last loaded message ID to prevent typewriter on existing messages
      if (messages.length > 0) {
        lastLoadedMessageIdRef.current = messages[messages.length - 1].id;
      }
      
      return () => clearTimeout(timer);
    }
  }, [currentSessionId, messages.length]);

  // Auto-focus input after Arc finishes responding
  const wasLoadingRef = useRef(false);
  useEffect(() => {
    // Focus input when loading transitions from true to false
    if (wasLoadingRef.current && !isLoading) {
      chatInputRef.current?.focusInput();
    }
    wasLoadingRef.current = isLoading;
  }, [isLoading]);

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

  // Scroll during typewriter typing - more aggressive
  useEffect(() => {
    const handleTyping = () => {
      const el = messagesContainerRef.current;
      if (!el) return;

      // Always scroll to bottom during typing
      el.scrollTo({
        top: el.scrollHeight,
        behavior: "auto", // Instant scroll during typing
      });
    };

    window.addEventListener("typewriter-typing", handleTyping);
    return () => window.removeEventListener("typewriter-typing", handleTyping);
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

  const handleNewChat = () => {
    const newSessionId = createNewSession();
    navigate(`/chat/${newSessionId}`);

    // Reset model to Quick for new chat (session only)
    sessionStorage.setItem("arc_session_model", "google/gemini-3-flash-preview");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    // Extract files from drag event
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length > 0) {
      // Pass files to ChatInput component via ref
      chatInputRef.current?.handleImageUploadFiles(files);
    }
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

  const currentSession = currentSessionId ? chatSessions.find(s => s.id === currentSessionId) : null;
  const sessionCanvas = currentSession?.canvasContent ?? '';
  const hasCanvas = (canvasContent || sessionCanvas).trim().length > 0;
  const canReopenCanvas = !isCanvasOpen && hasCanvas;

  // Main chat interface - Desktop with canvas uses PanelGroup for resizable layout
  const isDesktopCanvasMode = !isMobile && isCanvasOpen;
  
  return (
    <div
      className={cn(
        "h-screen flex relative overflow-hidden",
        (isPWAMode || isElectronApp) && "md:pt-[30px]"
      )}
      style={{
        paddingTop: isAdminBannerActive ? 'var(--admin-banner-height, 0px)' : undefined
      }}
    >

      {/* Main Content */}
      <div
        className={cn(
          "flex-1 flex flex-col transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] relative z-10",
          rightPanelOpen && !isCanvasOpen && "lg:ml-80 xl:ml-96",
        )}
      >
        {/* Floating header buttons - no bar, hide when canvas is open on desktop */}
        {!isCanvasOverlayActive && !isDesktopCanvasMode && (
          <div
            className={cn(
              "fixed left-0 right-0 z-40 transition-transform duration-300 ease-out pointer-events-none",
              isMobile && !headerVisible && "-translate-y-full",
            )}
            style={{
              top: isAdminBannerActive
                ? `calc(var(--admin-banner-height, 0px) + ${(isPWAMode || isElectronApp) && !isMobile ? '30px' : '0px'})`
                : (isPWAMode || isElectronApp) && !isMobile ? '30px' : '0px'
            }}
          >
            <div className="flex h-16 items-center justify-between px-4 pt-2 pointer-events-none">
              {/* Left-side buttons */}
              <div className="flex items-center gap-2 pointer-events-auto">
                <motion.div whileHover={{ scale: 1.1, y: -2 }} whileTap={{ scale: 0.95 }} transition={{ type: "spring", damping: 15, stiffness: 300 }}>
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-full glass-shimmer transition-all"
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
                    className="rounded-full glass-shimmer transition-all"
                    onClick={handleNewChat}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </motion.div>
              </div>

              {/* Right side buttons - Context + Canvas + Music + Logo */}
              <div className="flex items-center gap-2 pointer-events-auto">
                {/* Brain / Context Button */}
                <motion.div whileHover={{ scale: 1.1, y: -2 }} whileTap={{ scale: 0.95 }} transition={{ type: "spring", damping: 15, stiffness: 300 }}>
                  <Button
                    variant="outline"
                    size="icon"
                    className={cn(
                      "rounded-full glass-shimmer transition-all",
                      isContextPanelOpen && "ring-2 ring-primary/50"
                    )}
                    onClick={() => setIsContextPanelOpen(!isContextPanelOpen)}
                    title="Context"
                  >
                    <Brain className="h-4 w-4" />
                  </Button>
                </motion.div>

                {/* Canvas Reopen Button - shows when canvas is closed but has content */}
                <AnimatePresence>
                  {canReopenCanvas && (
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      whileHover={{ scale: 1.1, y: -2 }}
                      whileTap={{ scale: 0.95 }}
                      transition={{ type: "spring", damping: 15, stiffness: 300 }}
                    >
                      <Button
                        variant="outline"
                        size="icon"
                        className="rounded-full glass-shimmer transition-all ring-2 ring-purple-500/50"
                        onClick={() => {
                          // reopen without nuking current content
                          if (sessionCanvas && !canvasContent) hydrateFromSession(sessionCanvas);
                          reopenCanvas();
                        }}
                        title="Reopen Canvas"
                      >
                        <PenLine className="h-4 w-4 text-purple-400" />
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Music Player Button */}
                <motion.div 
                  whileHover={{ scale: 1.1, y: -2 }} 
                  whileTap={{ scale: 0.95 }} 
                  transition={{ type: "spring", damping: 15, stiffness: 300 }}
                  className="relative"
                >
                  <Button
                    variant="outline"
                    size="icon"
                    className={cn(
                      "rounded-full glass-shimmer transition-all",
                      isMusicPlaying && "ring-2 ring-primary/50"
                    )}
                    onClick={() => setIsMusicPopupOpen(!isMusicPopupOpen)}
                    title="Music Player"
                  >
                    {/* Show waveform when playing, music note when not */}
                    {isMusicPlaying ? (
                      <div className="flex items-end justify-center gap-[3px] h-4 w-4">
                        <motion.div 
                          className="w-[3px] bg-primary rounded-full"
                          animate={{ height: ["40%", "100%", "60%", "90%", "40%"] }}
                          transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
                        />
                        <motion.div 
                          className="w-[3px] bg-primary rounded-full"
                          animate={{ height: ["100%", "50%", "80%", "40%", "100%"] }}
                          transition={{ duration: 1, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
                        />
                        <motion.div 
                          className="w-[3px] bg-primary rounded-full"
                          animate={{ height: ["60%", "90%", "40%", "100%", "60%"] }}
                          transition={{ duration: 1, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
                        />
                      </div>
                    ) : (
                      <Music className="h-4 w-4" />
                    )}
                  </Button>
                </motion.div>

                {/* Logo Orb - clickable and opens support popup */}
                <motion.div
                  className="relative"
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  whileTap={{ scale: 0.95 }}
                  animate={isLogoSpinning ? { rotate: 360 } : { rotate: 0 }}
                  transition={isLogoSpinning ? { duration: 0.6, ease: "easeOut" } : { type: "spring", damping: 15, stiffness: 300 }}
                >
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-full glass-shimmer transition-all overflow-hidden"
                    onClick={() => {
                      // Trigger spin animation
                      setIsLogoSpinning(true);
                      setTimeout(() => setIsLogoSpinning(false), 600);

                      // Open support popup
                      setIsSupportPopupOpen(true);
                    }}
                    title="Support ArcAI"
                  >
                    <ThemedLogo className="h-9 w-9" alt="Arc" />
                  </Button>
                </motion.div>
              </div>
            </div>
          </div>
        )}

        {/* Mobile Canvas Panel (full takeover) */}
        {isCanvasOpen && isMobile && (
          <div className="fixed inset-0 z-[70] bg-background">
            <CanvasPanel />
            
            {/* Mobile canvas input toggle button */}
            <motion.div
              className="fixed bottom-6 left-4 z-[75]"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", damping: 15, stiffness: 300 }}
            >
              <Button
                variant="outline"
                size="icon"
                className={cn(
                  "rounded-full glass-shimmer shadow-lg",
                  showMobileCanvasInput && "ring-2 ring-primary/50"
                )}
                onClick={() => setShowMobileCanvasInput(!showMobileCanvasInput)}
              >
                <MessageCircle className="h-4 w-4" />
              </Button>
            </motion.div>

            {/* Mobile canvas input bar (hideable) */}
            <AnimatePresence>
              {showMobileCanvasInput && (
                <motion.div
                  initial={{ opacity: 0, y: 50 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 50 }}
                  transition={{ duration: 0.2 }}
                  className="fixed bottom-6 left-16 right-4 z-[75]"
                >
                  <div className="glass-dock">
                    <ChatInput ref={chatInputRef} onImagesChange={setHasSelectedImages} rightPanelOpen={false} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
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
            {/* Spacer for header */}
            <div style={{ paddingTop: "5rem" }} />

            {/* Empty state or hydrating state */}
            {messages.length === 0 ? (
              isHydratingSession === currentSessionId ? (
                // Show loading spinner while hydrating session messages
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-muted-foreground">Loading messages...</p>
                </div>
              ) : (
                <div style={{ paddingTop: "1rem" }}>
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
              )
            ) : (
              <div className="w-full flex justify-center px-4">
                <div
                  className="space-y-4 chat-messages w-full max-w-xl" // Messages only, now max-w-xl
                >
                  <AnimatePresence mode="popLayout" initial={false}>
                    {messages.map((message, index) => {
                      const isLastAssistantMessage = message.role === "assistant" && index === messages.length - 1;
                      // Only animate typewriter if this is a new message (not loaded from history)
                      const shouldAnimateTypewriter =
                        isLastAssistantMessage && message.id !== lastLoadedMessageIdRef.current && !isSessionLoading;

                      return (
                        <motion.div
                          key={message.id}
                          initial={isSessionLoading ? false : { opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{
                            duration: isSessionLoading ? 0 : 0.15,
                            ease: "easeOut",
                          }}
                          layout={false}
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
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
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
              </div>
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

          {/* Free-floating input shelf with canvas tile above it */}
          {/* On desktop with canvas open: constrain to left side */}
          <div
            ref={inputDockRef}
            className={cn(
              "fixed bottom-6 z-30 pointer-events-none px-4 transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
              "left-0",
              // When canvas is open on desktop, limit to left 50% of screen (search mode is now full-screen)
              isCanvasOpen && !isMobile ? "right-[50%]" : "right-0",
              rightPanelOpen && !isCanvasOpen && "lg:left-80 xl:left-96"
            )}
          >
            <div className="max-w-4xl mx-auto">
              <div className="pointer-events-auto glass-dock" data-has-images={hasSelectedImages}>
                <ChatInput ref={chatInputRef} onImagesChange={setHasSelectedImages} rightPanelOpen={rightPanelOpen} />
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

        {/* Support Popup */}
        <SupportPopup
          isOpen={isSupportPopupOpen}
          onClose={() => setIsSupportPopupOpen(false)}
        />

        {/* Music Popup */}
        <MusicPopup
          isOpen={isMusicPopupOpen}
          onClose={() => setIsMusicPopupOpen(false)}
        />

        {/* Context Blocks Panel */}
        <ContextBlocksPanel
          isOpen={isContextPanelOpen}
          onClose={() => setIsContextPanelOpen(false)}
        />

        {/* Global Audio Element for Music Player */}
        <audio
          ref={audioRef}
          src={currentMusicTrack.url}
          loop
          preload="metadata"
        />
      </div>

      {/* Side-by-side Canvas Panel on RIGHT (Desktop only) with resize handle */}
      <AnimatePresence>
        {isCanvasOpen && !isMobile && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "50%", opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="flex-shrink-0 overflow-hidden bg-background flex relative"
            style={{ minWidth: 400, paddingLeft: 12 }}
          >
            {/* Resize Handle - positioned absolutely to extend grab area into chat */}
            <div 
              className="absolute left-0 top-0 bottom-0 w-3 cursor-col-resize z-50 group"
              onMouseDown={(e) => {
                e.preventDefault();
                const canvasEl = e.currentTarget.parentElement;
                const inputDock = inputDockRef.current;
                if (!canvasEl) return;
                const startX = e.clientX;
                const startWidth = canvasEl.offsetWidth;
                const containerWidth = canvasEl.parentElement?.offsetWidth || window.innerWidth;
                
                // Add a full-screen overlay to capture mouse events during drag
                const overlay = document.createElement('div');
                overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;cursor:col-resize;';
                document.body.appendChild(overlay);
                
                const onMouseMove = (moveEvent: MouseEvent) => {
                  const delta = startX - moveEvent.clientX;
                  const newWidth = Math.min(
                    Math.max(startWidth + delta, containerWidth * 0.5), // min 50%
                    containerWidth * 0.75 // max 75%
                  );
                  canvasEl.style.width = `${newWidth}px`;
                  // Update input bar to match canvas width
                  if (inputDock) {
                    const rightPercent = (newWidth / containerWidth) * 100;
                    inputDock.style.right = `${rightPercent}%`;
                  }
                };
                
                const onMouseUp = () => {
                  document.removeEventListener('mousemove', onMouseMove);
                  document.removeEventListener('mouseup', onMouseUp);
                  overlay.remove();
                };
                
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
              }}
            >
              {/* Visual indicator */}
              <div className="absolute left-1 top-0 bottom-0 w-1 bg-border/30 group-hover:bg-primary/50 group-active:bg-primary transition-colors" />
            </div>
            <div className="flex-1 overflow-hidden">
              <CanvasPanel />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search Mode - Full Screen Takeover (all devices) */}
      <AnimatePresence>
        {isSearchOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed inset-0 z-[100] bg-background"
          >
            <SearchCanvas />
          </motion.div>
        )}
      </AnimatePresence>

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
          background: linear-gradient(135deg, hsl(var(--background) / 0.7) 0%, hsl(var(--background) / 0.65) 50%, hsl(var(--primary) / 0.15) 100%);
          backdrop-filter: blur(24px) saturate(115%);
          -webkit-backdrop-filter: blur(24px) saturate(115%);
          border: 1px solid hsl(var(--primary) / 0.3);
          box-shadow:
            0 8px 32px rgba(0, 0, 0, 0.3),
            inset 0 0 20px hsl(var(--primary-glow) / 0.12);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          cursor: text;
        }
        .glass-dock::before{ display: none; }
        .glass-dock:hover{
          transform: scale(1.02);
          background: linear-gradient(135deg, hsl(var(--background) / 0.68) 0%, hsl(var(--background) / 0.62) 50%, hsl(var(--primary) / 0.18) 100%);
          border-color: hsl(var(--primary) / 0.35);
          box-shadow:
            0 8px 32px rgba(0, 0, 0, 0.4),
            inset 0 0 24px hsl(var(--primary-glow) / 0.15);
        }
        .glass-dock:focus-within{
          background: linear-gradient(135deg, hsl(var(--background) / 0.65) 0%, hsl(var(--background) / 0.6) 50%, hsl(var(--primary) / 0.22) 100%);
          border-color: hsl(var(--primary) / 0.4);
          box-shadow:
            0 8px 32px rgba(0, 0, 0, 0.4),
            inset 0 0 24px hsl(var(--primary-glow) / 0.2),
            0 0 32px hsl(var(--primary-glow) / 0.25);
        }

        /* Hide button borders inside input bar for unified appearance */
        .glass-dock button{ border-color: transparent !important; }
        .glass-dock .ci-menu-btn{ background: rgba(255, 255, 255, 0.05) !important; }
        .glass-dock button:hover:not(:disabled){ background: rgba(255, 255, 255, 0.08) !important; }

        /* Remove textarea background to prevent layered rectangle appearance */
        .glass-dock textarea{ background: transparent !important; border-radius: 0 !important; }
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

      {/* Voice Mode Overlay */}
      <VoiceModeOverlay />
      
      {/* Voice Mode Controller (orchestrates the conversation) */}
      <VoiceModeController />
    </div>
  );
}
