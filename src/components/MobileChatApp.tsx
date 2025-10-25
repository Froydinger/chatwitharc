import { useState, useRef, useEffect } from "react";
import { Plus, Menu, Sun, Moon, ArrowDown, X } from "lucide-react";
import { motion } from "framer-motion";
import { useArcStore } from "@/store/useArcStore";
import { MessageBubble } from "@/components/MessageBubble";
import { ChatInput, cancelCurrentRequest } from "@/components/ChatInput";
import { RightPanel } from "@/components/RightPanel";
import { WelcomeSection } from "@/components/WelcomeSection";
import { ThinkingIndicator } from "@/components/ThinkingIndicator";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useProfile } from "@/hooks/useProfile";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

/** Time-of-day greeting (no name usage) */
function getDaypartGreeting(d: Date = new Date()): "Good Morning" | "Good Afternoon" | "Good Evening" {
  const h = d.getHours();
  if (h >= 5 && h < 12) return "Good Morning";
  if (h >= 12 && h < 18) return "Good Afternoon";
  return "Good Evening";
}

/** Keep header logo as-is; use the head-only avatar above prompts */
const HEADER_LOGO = "/arc-logo.png";
const HERO_AVATAR = "/arc-logo.png";

export function MobileChatApp() {
  const {
    messages,
    isLoading,
    isGeneratingImage,
    createNewSession,
    startChatWithMessage,
    currentSessionId,
    rightPanelOpen,
    setRightPanelOpen,
    rightPanelTab,
    setRightPanelTab,
  } = useArcStore();
  const { profile } = useProfile();
  const { theme, toggleTheme } = useTheme();
  const [dragOver, setDragOver] = useState(false);
  const [hasSelectedImages, setHasSelectedImages] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Scroll container for messages
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Fixed input dock measurement
  const inputDockRef = useRef<HTMLDivElement>(null);
  const [inputHeight, setInputHeight] = useState<number>(96);
  const { toast } = useToast();

  // Greeting with user's name when available
  const getPersonalizedGreeting = () => {
    const timeGreeting = getDaypartGreeting();
    const displayName = profile?.display_name;
    return displayName ? `${timeGreeting}, ${displayName}` : timeGreeting;
  };
  const [greeting, setGreeting] = useState(getPersonalizedGreeting());
  useEffect(() => {
    setGreeting(getPersonalizedGreeting());
    const id = setInterval(() => setGreeting(getPersonalizedGreeting()), 60_000);
    return () => clearInterval(id);
  }, [profile?.display_name]);

  // Quick Prompts - 6 Chat, 6 Create, 6 Write, 6 Code
  const quickPrompts = [
    // Chat prompts
    {
      label: "💭 Reflect",
      prompt: "Walk me through a guided reflection on where I've been, what I've learned, and where I'm heading.",
    },
    {
      label: "🧘 Check-in",
      prompt:
        "Help me do a real wellness check. Ask me about my mood, energy, and what's on my mind, then give me honest feedback.",
    },
    {
      label: "🎯 Focus",
      prompt: "Help me set up a focused work session. Guide me through planning a productive sprint.",
    },
    {
      label: "💬 Chat",
      prompt: "Let's have a casual conversation. Ask me about my day and chat like we're catching up.",
    },
    {
      label: "🤝 Advice",
      prompt: "I have a situation I need advice on. Help me think through a decision or challenge I'm facing.",
    },
    {
      label: "🙏 Gratitude",
      prompt: "Lead me through a quick gratitude exercise to help me appreciate the good things in my life.",
    },
    // Create/Image prompts - 3 are 90s, 3 are not
    {
      label: "🎨 Dream Poster",
      prompt:
        "Generate an image: a wild, colorful retro 90s poster design concept. Think neon colors, geometric shapes, and absolute chaos in the best way.",
    },
    {
      label: "🌌 Cosmic Explorer",
      prompt:
        "Generate an image: a stunning cosmic landscape with planets, nebulae, and distant galaxies. Make it feel vast and awe-inspiring.",
    },
    {
      label: "🎬 Cult Classic",
      prompt: "Generate an image: a movie poster for a hidden gem 90s film. Make it visually striking and nostalgic.",
    },
    {
      label: "🌸 Nature's Canvas",
      prompt:
        "Generate an image: a beautiful, serene natural scene with lush details, perfect lighting, and a peaceful atmosphere.",
    },
    {
      label: "🎪 Fever Dream",
      prompt:
        "Generate an image: the most unhinged, beautiful, chaotic 90s vaporwave aesthetic scene. Neon lights, palm trees, abandoned malls.",
    },
    {
      label: "✨ Ethereal Portrait",
      prompt:
        "Generate an image: an artistic, ethereal portrait with dreamlike qualities, soft lighting, and beautiful composition.",
    },
    // Write prompts
    {
      label: "📖 Short Story",
      prompt:
        "Help me write a compelling short story. Guide me through character development, plot, and an engaging narrative.",
    },
    {
      label: "✍️ Personal Essay",
      prompt:
        "Help me craft a personal essay about a meaningful experience. Let's explore themes and structure together.",
    },
    {
      label: "💌 Heartfelt Letter",
      prompt: "Help me write a sincere, heartfelt letter to someone important. Let's make it authentic and meaningful.",
    },
    {
      label: "🎭 Screenplay Scene",
      prompt: "Help me write a cinematic scene with dialogue and action. Let's create something visually compelling.",
    },
    {
      label: "📝 Blog Post",
      prompt:
        "Help me write an engaging blog post on a topic I care about. Let's make it conversational and insightful.",
    },
    {
      label: "🖋️ Poetry",
      prompt:
        "Help me write a poem that captures emotion and imagery. Let's explore different styles and find the right voice.",
    },
    // Code prompts
    {
      label: "🎮 Interactive Demo",
      prompt: "Code: Build an interactive demo or game using HTML, CSS, and JavaScript. Make it fun and visually appealing.",
    },
    {
      label: "📊 Dashboard",
      prompt: "Code: Create a dashboard interface with HTML and CSS. Include charts, stats, and a clean layout.",
    },
    {
      label: "🎨 Animation",
      prompt: "Code: Create a beautiful CSS and JavaScript animation. Make it smooth and eye-catching.",
    },
    {
      label: "🧮 Calculator",
      prompt: "Code: Build a calculator using HTML, CSS, and JavaScript. Include a clean UI and proper error handling.",
    },
    {
      label: "🎯 Landing Page",
      prompt: "Code: Create a modern landing page with HTML and CSS. Make it responsive and conversion-focused.",
    },
    {
      label: "🛠️ Form Builder",
      prompt: "Code: Create an interactive form with validation using HTML, CSS, and JavaScript.",
    },
  ];

  // Smooth scroll to bottom on new content - only when there are messages
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el || messages.length === 0) return; // Don't scroll if no messages
    el.scrollTo({
      top: el.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isLoading, isGeneratingImage]);

  // Show/hide scroll button based on scroll position
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;

    const handleScroll = () => {
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
      setShowScrollButton(!isNearBottom && messages.length > 0);
    };

    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, [messages.length]);

  const scrollToBottom = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: "smooth",
    });
  };

  // When chat is empty, go to top
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    if (messages.length === 0) {
      // Use a small delay to ensure DOM has rendered
      setTimeout(() => {
        el.scrollTop = 0;
        requestAnimationFrame(() => (el.scrollTop = 0));
      }, 10);
    }
  }, [messages.length]);

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
    // Immediately scroll to top
    const el = messagesContainerRef.current;
    if (el) {
      el.scrollTop = 0;
    }
    
    createNewSession();
    setRightPanelOpen(false);
    
    // Force scroll to top again after state updates
    setTimeout(() => {
      if (el) {
        el.scrollTop = 0;
      }
    }, 0);
    
    requestAnimationFrame(() => {
      if (el) {
        el.scrollTop = 0;
      }
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const triggerPrompt = (prompt: string) => {
    startChatWithMessage(prompt);
    setRightPanelOpen(false);
  };

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
    <div className="min-h-screen bg-background flex">
      {/* Main Content */}
      <div
        className={cn(
          "flex-1 flex flex-col transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
          rightPanelOpen && "lg:mr-80 xl:mr-96",
        )}
      >
        {/* Header */}
        <header className="sticky top-0 z-40 border-b border-border/40 backdrop-blur supports-[backdrop-filter]:bg-background/60 pt-2 pb-1.5 dark:bg-[rgba(24,24,30,0.78)] bg-background/95">
          <div className="flex h-16 items-center justify-between px-4">
            <div className="flex items-center gap-2">
              <div className="relative">
                <motion.img
                  src={HERO_AVATAR}
                  alt="ArcAI"
                  className="h-12 w-12 rounded-small"
                  animate={{ y: [0, -2, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.div
                  className="absolute -inset-0.5 bg-primary/20 rounded-full blur-[6px]"
                  animate={{ scale: [1, 1.05, 1], opacity: [0.2, 0.4, 0.2] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                />
              </div>
              <div>
                <h1 className="text-lg">
                  <span className="text-[#00cdff] text-lg font-normal">Arc</span>
                  <span className="font-semibold">Ai</span>
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="rounded-full" onClick={handleNewChat}>
                <Plus className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="rounded-full"
                onClick={toggleTheme}
                title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="rounded-full"
                onClick={() => {
                  setRightPanelOpen(!rightPanelOpen);
                }}
              >
                <Menu className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>

        {/* Scrollable messages layer with bottom padding equal to dock height */}
        <div
          className={`relative flex-1 ${dragOver ? "bg-primary/5" : ""}`}
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
            className="absolute inset-0 overflow-y-auto"
            style={{ paddingBottom: `calc(${inputHeight}px + env(safe-area-inset-bottom, 0px) + 6rem)` }}
          >
            {/* Empty state */}
            {messages.length === 0 ? (
              <WelcomeSection
                greeting={greeting}
                heroAvatar={HERO_AVATAR}
                quickPrompts={quickPrompts}
                onTriggerPrompt={triggerPrompt}
              />
            ) : (
              <div className="p-4 space-y-4 chat-messages">
                {messages.map((message, index) => {
                  const isLastAssistantMessage = 
                    message.role === 'assistant' && 
                    index === messages.length - 1;
                  
                  return (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      isLatestAssistant={isLastAssistantMessage}
                      isThinking={isLastAssistantMessage && isLoading && !isGeneratingImage}
                      onEdit={async (messageId: string, newContent: string) => {
                        const chatInputEvent = new CustomEvent("processEditedMessage", {
                          detail: { content: newContent, editedMessageId: messageId },
                        });
                        window.dispatchEvent(chatInputEvent);
                      }}
                    />
                  );
                })}
                {/* Show thinking logo when loading and no messages yet or last message is user */}
                {isLoading && !isGeneratingImage && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
                  <div className="flex justify-start pl-4">
                    <motion.div
                      className="flex items-center justify-start"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ 
                        opacity: 1, 
                        scale: 1,
                        rotate: 360
                      }}
                      transition={{ 
                        opacity: { duration: 0.3 },
                        scale: { duration: 0.3 },
                        rotate: { duration: 2, repeat: Infinity, ease: "linear" }
                      }}
                    >
                      <div className="relative">
                        <img 
                          src="/arc-logo.png" 
                          alt="Arc" 
                          className="h-24 w-24 rounded-full"
                        />
                        <motion.div
                          className="absolute -inset-2 bg-primary/40 rounded-full blur-lg"
                          animate={{ 
                            scale: [1, 1.3, 1],
                            opacity: [0.4, 0.7, 0.4]
                          }}
                          transition={{ 
                            duration: 1.5, 
                            repeat: Infinity, 
                            ease: "easeInOut" 
                          }}
                        />
                      </div>
                    </motion.div>
                  </div>
                )}
                {/* Cancel button during loading */}
                {isLoading && !isGeneratingImage && messages.length > 0 && (
                  <div className="flex justify-start pl-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        cancelCurrentRequest();
                      }}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5 mr-1.5" />
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Scroll to bottom button */}
          {showScrollButton && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="fixed bottom-32 left-[45%] -translate-x-1/2 z-40 pointer-events-auto"
            >
              <Button
                size="icon"
                variant="outline"
                className="rounded-full shadow-lg bg-background/80 backdrop-blur-sm border border-primary/20"
                onClick={scrollToBottom}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
            </motion.div>
          )}

          {/* Free-floating input shelf */}
          <div ref={inputDockRef} className="fixed inset-x-0 bottom-6 z-30 pointer-events-none px-4">
            <div
              className={cn(
                "transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] max-w-4xl mx-auto",
                rightPanelOpen && "lg:mr-80 xl:mr-96",
              )}
            >
              <div className="pointer-events-auto glass-dock" data-has-images={hasSelectedImages}>
                <ChatInput onImagesChange={setHasSelectedImages} />
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
          background: rgba(24, 24, 30, 0.78);
          backdrop-filter: blur(10px) saturate(115%);
          -webkit-backdrop-filter: blur(10px) saturate(115%);
          border: 1px solid color-mix(in oklab, hsl(var(--border)) 35%, transparent);
        }
        .glass-dock::before{ display: none; }
        .glass-dock:hover{ transform: none; transition: none; }
        .glass-dock:focus-within{ background: rgba(24, 24, 30, 0.78); box-shadow: none; }
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
