// src/components/MobileChatApp.tsx
import { useState, useRef, useEffect } from "react";
import { Plus, Menu, Sun, Moon } from "lucide-react";
import { motion } from "framer-motion";
import { useArcStore } from "@/store/useArcStore";
import { MessageBubble } from "@/components/MessageBubble";
import { ChatInput } from "@/components/ChatInput";
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

const HERO_AVATAR = "/lovable-uploads/87484cd8-85ad-46c7-af84-5cfe46e7a8f8.png";

export function MobileChatApp() {
  const {
    messages,
    isLoading,
    isGeneratingImage,
    createNewSession,
    startChatWithMessage,
    rightPanelOpen,
    setRightPanelOpen,
    rightPanelTab,
    setRightPanelTab,
  } = useArcStore();

  const { profile } = useProfile();
  const { theme, toggleTheme } = useTheme();
  const [dragOver, setDragOver] = useState(false);
  const [hasSelectedImages, setHasSelectedImages] = useState(false);

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

  // Quick Prompts
  const quickPrompts = [
    {
      label: "🎯 Focus",
      prompt: "Help me set up a focused work session. Guide me through planning a productive 25-minute sprint.",
    },
    {
      label: "🎨 Create",
      prompt: "I need creative inspiration. Give me an interesting creative idea I can work on today.",
    },
    {
      label: "💭 Check-in",
      prompt:
        "Help me do a quick wellness check. Ask me about my mood and energy level, then give me personalized advice.",
    },
    {
      label: "💬 Chat",
      prompt: "I want to have a casual conversation. Ask me about my day and let's chat like friends.",
    },
    {
      label: "🤝 Advice",
      prompt: "I have a situation I need advice on. Help me think through a decision or challenge I'm facing.",
    },
    {
      label: "🙏 Gratitude",
      prompt: "Lead me through a quick gratitude exercise to help me appreciate the good things in my life.",
    },
    { label: "📚 Learn", prompt: "Help me understand something new. I want to learn about a topic that interests me." },
    {
      label: "📋 Plan",
      prompt: "Help me organize my day or week. Guide me through creating a structured plan for my goals.",
    },
    {
      label: "🪞 Reflect",
      prompt: "Lead me through a guided reflection session about my recent experiences and growth.",
    },
    { label: "⚡ Motivate", prompt: "I need encouragement and motivation. Help me feel inspired and energized." },
    {
      label: "🤔 Decide",
      prompt: "Help me make a decision. I have options to consider and need guidance on choosing the best path.",
    },
    {
      label: "🧘 Calm",
      prompt: "I need stress relief and calming support. Guide me through a relaxation or mindfulness exercise.",
    },
  ];

  // Smooth scroll to bottom on new content - only when there are messages
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el || messages.length === 0) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading, isGeneratingImage]);

  // When chat is empty, go to top
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    if (messages.length === 0) {
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
    createNewSession();
    setRightPanelOpen(false);
    setTimeout(() => {
      const el = messagesContainerRef.current;
      if (el) {
        el.scrollTop = 0;
        requestAnimationFrame(() => (el.scrollTop = 0));
      }
    }, 50);
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

  // Only show the thinking pill after a real user message exists.
  const hasUserMessage = messages.some((m) => m.role === "user");

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
        <header className="sticky top-0 z-40 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pt-2">
          <div className="flex h-16 items-center justify-between px-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <motion.img
                  src={HERO_AVATAR}
                  alt="ArcAI"
                  className="h-8 w-8 rounded-small avatar-filled-eyes"
                  animate={{ y: [0, -2, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.div
                  className="absolute -inset-1 bg-primary/20 rounded-full blur-sm"
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
                onClick={() => setRightPanelOpen(!rightPanelOpen)}
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
            style={{ paddingBottom: `calc(${inputHeight}px + env(safe-area-inset-bottom, 0px) + 3rem)` }}
          >
            {messages.length === 0 ? (
              <WelcomeSection
                greeting={greeting}
                heroAvatar={HERO_AVATAR}
                quickPrompts={quickPrompts}
                onTriggerPrompt={triggerPrompt}
                /* Do NOT pass loading flags here; prevents thinking pill on empty state */
              />
            ) : (
              <div className="p-4 space-y-4 chat-messages">
                {messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    onEdit={async (messageId: string, newContent: string) => {
                      const chatInputEvent = new CustomEvent("processEditedMessage", {
                        detail: { content: newContent, editedMessageId: messageId },
                      });
                      window.dispatchEvent(chatInputEvent);
                    }}
                  />
                ))}
                {isLoading && !isGeneratingImage && hasUserMessage && (
                  <ThinkingIndicator isLoading={true} isGeneratingImage={false} />
                )}
              </div>
            )}
          </div>

          {/* Free-floating input shelf */}
          <div ref={inputDockRef} className="fixed inset-x-0 bottom-6 z-50 pointer-events-none px-4">
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

        <RightPanel
          isOpen={rightPanelOpen}
          onClose={() => setRightPanelOpen(false)}
          activeTab={rightPanelTab as any}
          onTabChange={setRightPanelTab}
        />
      </div>

      {/* Scoped styles */}
      <style>{`
        img.ai-avatar{ opacity:0; filter:saturate(1) contrast(1); transition:opacity 260ms ease, transform 260ms ease; transform:translateY(2px); will-change:opacity,transform;}
        img.ai-avatar.is-loaded{ opacity:1; transform:translateY(0); }
        .floating-hero{ animation: float-3 5.2s ease-in-out infinite; }
        @keyframes float-3 { 0%,100%{transform:translate(0,0) rotate(0)} 20%{transform:translate(1px,1px) rotate(.2deg)} 40%{transform:translate(-1px,2px) rotate(-.3deg)} 60%{transform:translate(2px,-1px) rotate(.25deg)} 80%{transform:translate(-2px,0) rotate(-.2deg)} }

        .chat-messages .surface,
        .chat-messages .card,
        .chat-messages [data-bubble],
        .chat-messages [class*="bubble"]{
          border-radius: 18px !important;
          background: rgba(18,18,18,0.42) !important;
          backdrop-filter: blur(8px) saturate(118%) !important;
          -webkit-backdrop-filter: blur(8px) saturate(118%) !important;
          border: 1px solid rgba(255,255,255,0.06) !important;
          box-shadow: 0 2px 10px rgba(0,0,0,0.22), inset 0 1.5px 0 rgba(255,255,255,0.08), inset 0 1px 0 rgba(255,255,255,0.04) !important;
        }

        /* —— Minimal Luxe Input Bar —— */
        .glass-dock{
          position: relative;
          margin: 0 auto;
          max-width: 760px;
          padding: 10px;
          border-radius: 9999px !important;
          overflow: visible;
          background: color-mix(in oklab, hsl(var(--background)) 82%, transparent);
          backdrop-filter: blur(10px) saturate(115%);
          -webkit-backdrop-filter: blur(10px) saturate(115%);
          border: 1px solid color-mix(in oklab, hsl(var(--border)) 35%, transparent);
          box-shadow: 0 2px 10px rgba(0,0,0,.20), 0 1px 0 rgba(255,255,255,.02) inset;
          isolation: isolate;
        }
        .glass-dock::before{
          content:""; position:absolute; inset:0; border-radius:inherit; pointer-events:none;
          background: radial-gradient(120% 120% at 50% 50%, color-mix(in oklab, hsl(var(--primary)) 14%, transparent) 0%, transparent 40%);
          opacity:.18;
        }
        .glass-dock:hover{ box-shadow: 0 4px 18px rgba(0,0,0,.22), 0 1px 0 rgba(255,255,255,.03) inset; transform: translateY(-0.5px); transition: transform .18s ease, box-shadow .18s ease, background .18s ease; }
        .glass-dock:focus-within{ background: color-mix(in oklab, hsl(var(--background)) 88%, transparent); box-shadow: 0 6px 22px rgba(0,0,0,.25), 0 0 0 1px color-mix(in oklab, hsl(var(--primary)) 26%, transparent) inset; }
        .glass-dock > *{ position: relative; z-index: 1; }
        .glass-dock :is(.input-wrapper,.input-container,.chat-input,form){ background: transparent !important; border: 0 !important; box-shadow: none !important; }
        .glass-dock .chat-input-halo{ border-radius: 9999px !important; border: 1px solid color-mix(in oklab, hsl(var(--border)) 28%, transparent) !important; background: color-mix(in oklab, hsl(var(--background)) 65%, transparent) !important; padding: 8px 10px !important; }
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
