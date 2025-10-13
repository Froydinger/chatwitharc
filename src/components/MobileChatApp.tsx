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

/** Keep header logo as-is; use the head-only avatar above prompts */
const HEADER_LOGO = "/lovable-uploads/c65f38aa-5928-46e1-b224-9f6a2bacbf18.png";
const HERO_AVATAR = "/lovable-uploads/87484cd8-85ad-46c7-af84-5cfe46e7a8f8.png";
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
    setRightPanelTab
  } = useArcStore();
  const {
    profile
  } = useProfile();
  const {
    theme,
    toggleTheme
  } = useTheme();
  const [dragOver, setDragOver] = useState(false);
  const [hasSelectedImages, setHasSelectedImages] = useState(false);

  // Scroll container for messages
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Fixed input dock measurement
  const inputDockRef = useRef<HTMLDivElement>(null);
  const [inputHeight, setInputHeight] = useState<number>(96);
  const {
    toast
  } = useToast();

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
  const quickPrompts = [{
    label: "🎯 Focus",
    prompt: "Help me set up a focused work session. Guide me through planning a productive 25-minute sprint."
  }, {
    label: "🎨 Create",
    prompt: "I need creative inspiration. Give me an interesting creative idea I can work on today."
  }, {
    label: "💭 Check-in",
    prompt: "Help me do a quick wellness check. Ask me about my mood and energy level, then give me personalized advice."
  }, {
    label: "💬 Chat",
    prompt: "I want to have a casual conversation. Ask me about my day and let's chat like friends."
  }, {
    label: "🤝 Advice",
    prompt: "I have a situation I need advice on. Help me think through a decision or challenge I'm facing."
  }, {
    label: "🙏 Gratitude",
    prompt: "Lead me through a quick gratitude exercise to help me appreciate the good things in my life."
  }, {
    label: "📚 Learn",
    prompt: "Help me understand something new. I want to learn about a topic that interests me."
  }, {
    label: "📋 Plan",
    prompt: "Help me organize my day or week. Guide me through creating a structured plan for my goals."
  }, {
    label: "🪞 Reflect",
    prompt: "Lead me through a guided reflection session about my recent experiences and growth."
  }, {
    label: "⚡ Motivate",
    prompt: "I need encouragement and motivation. Help me feel inspired and energized."
  }, {
    label: "🤔 Decide",
    prompt: "Help me make a decision. I have options to consider and need guidance on choosing the best path."
  }, {
    label: "🧘 Calm",
    prompt: "I need stress relief and calming support. Guide me through a relaxation or mindfulness exercise."
  }];

  // Smooth scroll to bottom on new content - only when there are messages
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el || messages.length === 0) return; // Don't scroll if no messages
    el.scrollTo({
      top: el.scrollHeight,
      behavior: "smooth"
    });
  }, [messages, isLoading, isGeneratingImage]);

  // When chat is empty, go to top
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    if (messages.length === 0) {
      // Use a small delay to ensure DOM has rendered
      setTimeout(() => {
        el.scrollTop = 0;
        requestAnimationFrame(() => el.scrollTop = 0);
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
    // Let the useEffect handle scrolling when messages become empty
    // Add a small delay to ensure DOM has updated
    setTimeout(() => {
      const el = messagesContainerRef.current;
      if (el) {
        el.scrollTop = 0;
        requestAnimationFrame(() => el.scrollTop = 0);
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
      const likely = img.hasAttribute("data-ai-avatar") || img.classList.contains("ai-avatar") || alt.includes("arc") || alt.includes("assistant") || alt.includes("arcai");
      if (likely) {
        img.classList.add("ai-avatar");
        img.classList.remove("is-loaded");
        const markLoaded = () => img.classList.add("is-loaded");
        if (img.complete && img.naturalWidth > 0) markLoaded();else {
          img.addEventListener("load", markLoaded, {
            once: true
          });
          img.addEventListener("error", markLoaded, {
            once: true
          });
        }
      }
    };
    const scan = () => root.querySelectorAll("img").forEach(n => tagCandidate(n as HTMLImageElement));
    scan();
    const mo = new MutationObserver(muts => {
      for (const m of muts) {
        m.addedNodes.forEach(n => {
          if (n instanceof HTMLImageElement) tagCandidate(n);else if (n instanceof HTMLElement) n.querySelectorAll("img").forEach(img => tagCandidate(img as HTMLImageElement));
        });
      }
    });
    mo.observe(root, {
      childList: true,
      subtree: true
    });
    return () => mo.disconnect();
  }, []);

  // Main chat interface
  return <div className="min-h-screen bg-background flex">
      {/* Main Content */}
      <div className={cn("flex-1 flex flex-col transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]", rightPanelOpen && "lg:mr-80 xl:mr-96")}>
        {/* Header */}
        <header className="sticky top-0 z-40 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pt-2">
          <div className="flex h-16 items-center justify-between px-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <motion.img src={HERO_AVATAR} alt="ArcAI" className="h-8 w-8 rounded-small avatar-filled-eyes" animate={{
                y: [0, -2, 0]
              }} transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut"
              }} />
                <motion.div className="absolute -inset-1 bg-primary/20 rounded-full blur-sm" animate={{
                scale: [1, 1.05, 1],
                opacity: [0.2, 0.4, 0.2]
              }} transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }} />
              </div>
              <div>
                <h1 className="text-lg">
                  <span className="text-[#00cdff] text-lg font-normal">Arc</span><span className="font-semibold">Ai</span>
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="rounded-full" onClick={handleNewChat}>
                <Plus className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="rounded-full" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <Button variant="outline" size="icon" className="rounded-full" onClick={() => {
              setRightPanelOpen(!rightPanelOpen);
            }}>
                <Menu className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>

      {/* Scrollable messages layer with bottom padding equal to dock height */}
      <div className={`relative flex-1 ${dragOver ? "bg-primary/5" : ""}`} onDragOver={e => {
        e.preventDefault();
        setDragOver(true);
      }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop}>
        {/* Chat Messages */}
        <div ref={messagesContainerRef} className="absolute inset-0 overflow-y-auto" style={{
          paddingBottom: `calc(${inputHeight}px + env(safe-area-inset-bottom, 0px) + 2rem)`
        }}>
          {/* Empty state */}
          {messages.length === 0 ? <WelcomeSection greeting={greeting} heroAvatar={HERO_AVATAR} quickPrompts={quickPrompts} onTriggerPrompt={triggerPrompt} isLoading={isLoading} isGeneratingImage={isGeneratingImage} /> : <div className="p-4 space-y-4 chat-messages">
              {messages.map(message => <MessageBubble key={message.id} message={message} onEdit={async (messageId: string, newContent: string) => {
              // When a message is edited, trigger a new AI response
              // Message edited, triggering new response

              // Get the ChatInput component to handle the response
              const chatInputEvent = new CustomEvent('processEditedMessage', {
                detail: {
                  content: newContent,
                  editedMessageId: messageId
                }
              });
              window.dispatchEvent(chatInputEvent);
            }} />)}
              {/* Only show ThinkingIndicator for text-only loading, not for image generation */}
              {isLoading && !isGeneratingImage && <ThinkingIndicator isLoading={true} isGeneratingImage={false} />}
            </div>}
        </div>

        {/* Fixed shelf input dock */}
        <div ref={inputDockRef} className="fixed inset-x-0 bottom-0 z-30 pointer-events-none">
          <div className={cn("transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]", rightPanelOpen && "lg:mr-80 xl:mr-96")}>
            <div className="pointer-events-auto glass-dock" data-has-images={hasSelectedImages}>
              <ChatInput onImagesChange={setHasSelectedImages} />
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel */}
      <RightPanel isOpen={rightPanelOpen} onClose={() => setRightPanelOpen(false)} activeTab={rightPanelTab as any} onTabChange={setRightPanelTab} />
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

        /* Input shelf - mobile first */
        .glass-dock{
          position: relative;
          border-radius: 1.5rem 1.5rem 0 0 !important;
          padding: 16px;
          margin: 0 10px;
          background: hsl(var(--background) / 0.8);
          backdrop-filter: blur(20px) saturate(120%);
          -webkit-backdrop-filter: blur(20px) saturate(120%);
          border-top: 1px solid hsl(var(--border) / 0.5);
          box-shadow: 0 -4px 20px rgba(0,0,0,0.1);
          isolation: isolate;
          overflow: visible;
        }
        
        /* Desktop only - constrained width, same padding and border-radius */
        @media (min-width: 1024px) {
          .glass-dock {
            margin: 0 auto !important;
            max-width: 768px !important;
            border-radius: 1.5rem 1.5rem 0 0 !important;
          }
        }
        
        .glass-dock::before{
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: hsl(var(--background) / 0.6);
          z-index: 0;
        }
        .glass-dock > *{ position: relative; z-index: 1; }

        /* Remove rounded corners for shelf design */
        .glass-dock .chat-input-halo,
        .glass-dock .chat-input-halo.halo-active {
          border-radius: 0.75rem !important;
        }

        /* Define halo-active glow effect with correct border radius */
        .glass-dock .chat-input-halo.halo-active {
          box-shadow: 0 0 0 2px hsla(var(--primary), 0.3), 0 0 20px hsla(var(--primary), 0.15) !important;
        }

        /* Force border radius for all input states - stronger override */
        .glass-dock .chat-input-halo,
        .glass-dock .chat-input-halo.halo-active,
        .glass-dock .chat-input-halo:focus-within,
        .glass-dock .chat-input-halo:active,
        .glass-dock .chat-input-halo[data-active="true"] {
          border-radius: 1rem !important;
        }

        /* Ultra-specific override for any Tailwind classes */
        div.glass-dock div.chat-input-halo,
        div.glass-dock div.chat-input-halo.halo-active,
        .glass-dock > div.chat-input-halo {
          border-radius: 1rem !important;
        }

        /* Nuclear option - use attribute selector with inline style backup */
        .glass-dock .chat-input-halo[style*="border-radius"],
        .glass-dock .chat-input-halo[style*="borderRadius"] {
          border-radius: 1rem !important;
        }

        .glass-dock :is(.surface,.card,[class*="bg-"],[class*="ring-"],[class*="border"],[class*="shadow"],
                        .backdrop-blur,[class*="backdrop-"],[style*="backdrop-filter"]){
          background: transparent !important; box-shadow: none !important; border: 0 !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important;
        }
        .glass-dock :is(.input-wrapper,.input-container,.chat-input,.field,form){ background: transparent !important; box-shadow: none !important; border: 0 !important; }

        /* Nudge input text and placeholder down ~2px */
        .glass-dock input,
        .glass-dock textarea {
          padding-top: calc(0.75rem + 2px) !important;
          padding-bottom: calc(0.75rem - 2px) !important;
          line-height: 1.35 !important;
        }
        .glass-dock input::placeholder,
        .glass-dock textarea::placeholder {
          line-height: 1.35 !important;
          opacity: 0.7;
        }

        .glass-dock:focus-within{
          box-shadow: 0 10px 30px rgba(0,0,0,0.6), 0 0 16px 4px hsl(var(--primary)/0.3), 0 0 40px 10px hsl(var(--primary)/0.15) !important;
          border-radius: 1rem;
        }
        .glass-dock input, .glass-dock textarea{ font-size: 16px !important; }
        .glass-dock input:-webkit-autofill, .glass-dock textarea:-webkit-autofill{
          -webkit-box-shadow: 0 0 0px 1000px transparent inset !important;
          -webkit-text-fill-color: inherit !important;
          transition: background-color 999999s ease-in-out 0s !important;
        }
      `}</style>
    </div>;
}