import { useState, useRef, useEffect } from "react";
import { Plus, Settings, History, Brain, Sparkles } from "lucide-react";
import { useArcStore } from "@/store/useArcStore";
import { MessageBubble } from "@/components/MessageBubble";
import { ChatInput } from "@/components/ChatInput";
import { ChatHistoryPanel } from "@/components/ChatHistoryPanel";
import { SettingsPanel } from "@/components/SettingsPanel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

/** Time-of-day greeting (no name usage) */
function getDaypartGreeting(d: Date = new Date()): "Good Morning" | "Good Afternoon" | "Good Evening" {
  const h = d.getHours();
  if (h >= 5 && h < 12) return "Good Morning";
  if (h >= 12 && h < 18) return "Good Afternoon";
  return "Good Evening";
}

/** Keep header logo as-is; use head-only avatar above prompts */
const HEADER_LOGO = "/lovable-uploads/c65f38aa-5928-46e1-b224-9f6a2bacbf18.png";
const HERO_AVATAR  = "/lovable-uploads/87484cd8-85ad-46c7-af84-5cfe46e7a8f8.png";

/** Glow timings */
const CYCLE_MS = 5200;
const HALF_CYCLE_MS = CYCLE_MS / 2;

export function MobileChatApp() {
  const { 
    messages, 
    isLoading, 
    isGeneratingImage,
    createNewSession,
    startChatWithMessage,
    currentSessionId
  } = useArcStore();

  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Scroll container for messages
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Fixed input dock measurement
  const inputDockRef = useRef<HTMLDivElement>(null);
  const [inputHeight, setInputHeight] = useState<number>(96);

  const { toast } = useToast();

  // Greeting (updates with local time, no name)
  const [greeting, setGreeting] = useState(getDaypartGreeting());
  useEffect(() => {
    setGreeting(getDaypartGreeting());
    const id = setInterval(() => setGreeting(getDaypartGreeting()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Quick Prompts
  const quickPrompts = [
    { label: "🎯 Focus", prompt: "Help me set up a focused work session. Guide me through planning a productive 25-minute sprint." },
    { label: "🎨 Create", prompt: "I need creative inspiration. Give me an interesting creative idea I can work on today." },
    { label: "💭 Check-in", prompt: "Help me do a quick wellness check. Ask me about my mood and energy level, then give me personalized advice." },
    { label: "💬 Chat", prompt: "I want to have a casual conversation. Ask me about my day and let's chat like friends." },
    { label: "🤝 Advice", prompt: "I have a situation I need advice on. Help me think through a decision or challenge I'm facing." },
    { label: "🙏 Gratitude", prompt: "Lead me through a quick gratitude exercise to help me appreciate the good things in my life." },
    { label: "📚 Learn", prompt: "Help me understand something new. I want to learn about a topic that interests me." },
    { label: "📋 Plan", prompt: "Help me organize my day or week. Guide me through creating a structured plan for my goals." },
    { label: "🪞 Reflect", prompt: "Lead me through a guided reflection session about my recent experiences and growth." },
    { label: "⚡ Motivate", prompt: "I need encouragement and motivation. Help me feel inspired and energized." },
    { label: "🤔 Decide", prompt: "Help me make a decision. I have options to consider and need guidance on choosing the best path." },
    { label: "🧘 Calm", prompt: "I need stress relief and calming support. Guide me through a relaxation or mindfulness exercise." }
  ];

  /** Seamless prompt glow crossfade (ease in/out, no hold) */
  type Glow = { index: number; color: string };
  const [activeGlow, setActiveGlow] = useState<Glow | null>(null);
  const [armedGlow, setArmedGlow] = useState<Glow | null>(null);
  const [prevGlow, setPrevGlow] = useState<Glow | null>(null);
  const [decayIndex, setDecayIndex] = useState<number | null>(null);

  const glowPalette = [
    "rgba(99,102,241,0.70)",
    "rgba(59,130,246,0.70)",
    "rgba(16,185,129,0.70)",
    "rgba(20,184,166,0.70)",
    "rgba(139,92,246,0.70)",
    "rgba(236,72,153,0.70)",
    "rgba(234,179,8,0.70)"
  ];

  useEffect(() => {
    if (messages.length === 0) {
      let intervalId: number | undefined;
      let armTimeout: number | undefined;
      let clearPrevTimeout: number | undefined;
      let decayTimeout: number | undefined;

      const cycle = () => {
        const nextIndex = Math.floor(Math.random() * quickPrompts.length);
        const nextColor = glowPalette[Math.floor(Math.random() * glowPalette.length)];

        // fade current out during next half-cycle
        if (activeGlow) setPrevGlow(activeGlow);

        // stage next at 0 opacity then fade it in over HALF_CYCLE_MS
        setArmedGlow({ index: nextIndex, color: nextColor });
        armTimeout = window.setTimeout(() => {
          setActiveGlow({ index: nextIndex, color: nextColor });
          setArmedGlow(null);

          // halfway through, start decaying active (no hold)
          setDecayIndex(null);
          decayTimeout = window.setTimeout(() => setDecayIndex(nextIndex), HALF_CYCLE_MS - 40);
        }, 30);

        // remove previous after its fade-out completes
        clearPrevTimeout = window.setTimeout(() => setPrevGlow(null), HALF_CYCLE_MS);
      };

      cycle();
      intervalId = window.setInterval(cycle, CYCLE_MS);

      return () => {
        if (intervalId) window.clearInterval(intervalId);
        if (armTimeout) window.clearTimeout(armTimeout);
        if (clearPrevTimeout) window.clearTimeout(clearPrevTimeout);
        if (decayTimeout) window.clearTimeout(decayTimeout);
      };
    } else {
      setActiveGlow(null);
      setArmedGlow(null);
      setPrevGlow(null);
      setDecayIndex(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  // Listen for chat history close events
  useEffect(() => {
    const handleCloseHistory = () => setShowHistory(false);
    window.addEventListener("arcai:closeHistory", handleCloseHistory);
    return () => window.removeEventListener("arcai:closeHistory", handleCloseHistory);
  }, []);

  // Smooth scroll to bottom on new content
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading, isGeneratingImage]);

  // When chat is empty or session changes, go to top
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    if (messages.length === 0 || currentSessionId) {
      el.scrollTop = 0;
      requestAnimationFrame(() => (el.scrollTop = 0));
    }
  }, [messages.length, currentSessionId]);

  // Measure input dock height
  useEffect(() => {
    const update = () => inputDockRef.current && setInputHeight(inputDockRef.current.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    if (inputDockRef.current) ro.observe(inputDockRef.current);
    window.addEventListener("resize", update);
    return () => { window.removeEventListener("resize", update); ro.disconnect(); };
  }, []);

  const handleNewChat = () => {
    createNewSession();
    setShowHistory(false);
    setShowSettings(false);
    const el = messagesContainerRef.current;
    if (el) {
      el.scrollTop = 0;
      requestAnimationFrame(() => (el.scrollTop = 0));
    }
    toast({ title: "New Chat Started", description: "Ready for a fresh conversation!" });
  };

  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); };

  const triggerPrompt = (prompt: string) => {
    startChatWithMessage(prompt);
    setShowHistory(false);
    setShowSettings(false);
  };

  /** AI avatar progressive fade in after load */
  useEffect(() => {
    const root = messagesContainerRef.current ?? document.body;
    const tagCandidate = (img: HTMLImageElement) => {
      const alt = (img.getAttribute("alt") || "").toLowerCase();
      const likely =
        img.hasAttribute("data-ai-avatar") ||
        img.classList.contains("ai-avatar") ||
        alt.includes("arc") || alt.includes("assistant") || alt.includes("arcai");
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
          else if (n instanceof HTMLElement) n.querySelectorAll("img").forEach((img) => tagCandidate(img as HTMLImageElement));
        });
      }
    });
    mo.observe(root, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);

  /** Thinking indicator */
  const showThinking = isLoading || isGeneratingImage;
  const ThinkingIndicator = () => (
    <div className="flex justify-center">
      <div className="thinking-shell" data-show={showThinking ? "true" : "false"} aria-live="polite">
        <div className="surface thinking-pill rounded-full">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center">
              <Brain className="h-5 w-5 animate-bounce-slow" />
              <Sparkles className="h-3 w-3 absolute -top-1 -right-1 animate-twinkle" />
            </div>
            <span className="text-sm text-muted-foreground">
              {isGeneratingImage ? "Generating image..." : "Arc is thinking..."}
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  // Main chat interface
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <img src={HEADER_LOGO} alt="ArcAI" className="h-8 w-8" />
            <div>
              <h1 className="text-lg">
                <span className="font-thin">Arc</span><span className="font-semibold">Ai</span>
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" className="rounded-full" onClick={() => setShowHistory(true)}>
              <History className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="rounded-full" onClick={() => setShowSettings(true)}>
              <Settings className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="rounded-full" onClick={handleNewChat}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Scrollable messages layer with bottom padding equal to dock height */}
      <div
        className={`relative flex-1 ${dragOver ? "bg-primary/5" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <div
          ref={messagesContainerRef}
          className="absolute inset-0 overflow-y-auto"
          style={{ paddingBottom: `calc(${inputHeight}px + env(safe-area-inset-bottom, 0px) + 4rem)` }}
        >
          {/* Empty state */}
          {messages.length === 0 ? (
            <div className="flex flex-col h-full">
              {/* Welcome Section */}
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                <div className="mb-8">
                  {/* Head-only assistant avatar above prompts (no border) */}
                  <img
                    src={HERO_AVATAR}
                    alt="Arc assistant avatar"
                    className="assistant-hero-avatar ai-avatar h-20 w-20 mx-auto mb-4 floating-hero"
                  />
                  <h2 className="text-2xl font-bold text-foreground mb-2">
                    {greeting}!
                  </h2>
                </div>

                {/* Quick Prompts - 2 Column Grid */}
                <div className="w-full max-w-md grid grid-cols-2 gap-3 mb-20">
                  {quickPrompts.map((prompt, idx) => {
                    const isActive = activeGlow?.index === idx && decayIndex !== idx;
                    const isDecayingActive = activeGlow?.index === idx && decayIndex === idx;
                    const isArmed = armedGlow?.index === idx;
                    const isPrev = prevGlow?.index === idx;

                    const colorVar: any =
                      isActive ? { ["--glow-color" as any]: activeGlow!.color } :
                      isDecayingActive ? { ["--glow-color" as any]: activeGlow!.color } :
                      isArmed ? { ["--glow-color" as any]: armedGlow!.color } :
                      isPrev ? { ["--glow-color" as any]: prevGlow!.color } :
                      undefined;

                    return (
                      <button
                        key={idx}
                        onClick={() => triggerPrompt(prompt.prompt)}
                        style={colorVar}
                        className={[
                          "p-4 card text-center hover:bg-accent/50 transition-colors rounded-full border border-border/40",
                          "floating-prompt",
                          `floating-prompt-${idx}`,
                          isArmed ? "prompt-glow prompt-glow--armed" : "",
                          isActive ? "prompt-glow prompt-glow--show" : "",
                          isDecayingActive ? "prompt-glow prompt-glow--fadeout" : "",
                          isPrev ? "prompt-glow prompt-glow--fadeout" : "",
                        ].join(" ").trim()}
                      >
                        <span className="font-medium text-sm">{prompt.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* extra breathing room below prompts */}
                <div className="pb-10" />

                <ThinkingIndicator />
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-4 chat-messages">
              {/* Messages */}
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} onEdit={() => {}} />
              ))}

              <ThinkingIndicator />
            </div>
          )}
        </div>

        {/* Fixed glass input dock (unchanged) */}
        <div ref={inputDockRef} className="fixed inset-x-0 bottom-0 z-50 pointer-events-none">
          <div className="px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
            <div className="mx-auto max-w-screen-sm">
              <div className="pointer-events-auto glass-dock">
                <ChatInput />
              </div>
            </div>
          </div>
        </div>
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

        /* Very light floating for hero avatar — NO VISIBLE BORDER */
        .floating-hero{ animation: float-3 5.2s ease-in-out infinite; }
        .assistant-hero-avatar{
          border-radius: 24%;
          box-shadow: 0 12px 30px rgba(0,0,0,0.35); /* removed inset outline */
          border: none !important;
          outline: none !important;
          background: transparent;
        }

        /* Floating animation keyframes for different movement patterns */
        @keyframes float-1 { 0%,100%{transform:translate(0,0) rotate(0)} 25%{transform:translate(1px,-1px) rotate(0.5deg)} 50%{transform:translate(-1px,-2px) rotate(-0.5deg)} 75%{transform:translate(-2px,1px) rotate(0.3deg)} }
        @keyframes float-2 { 0%,100%{transform:translate(0,0) rotate(0)} 33%{transform:translate(-1px,1px) rotate(-0.3deg)} 66%{transform:translate(2px,0) rotate(0.4deg)} }
        @keyframes float-3 { 0%,100%{transform:translate(0px,0px) rotate(0)} 20%{transform:translate(1px,1px) rotate(0.2deg)} 40%{transform:translate(-1px,2px) rotate(-0.3deg)} 60%{transform:translate(2px,-1px) rotate(0.25deg)} 80%{transform:translate(-2px,0) rotate(-0.2deg)} }
        @keyframes float-4 { 0%,100%{transform:translate(0,0) rotate(0)} 50%{transform:translate(-1px,-1px) rotate(-0.3deg)} }
        @keyframes float-5 { 0%,100%{transform:translate(0,0) rotate(0)} 30%{transform:translate(2px,1px) rotate(0.4deg)} 70%{transform:translate(-1px,-2px) rotate(-0.2deg)} }
        @keyframes float-6 { 0%,100%{transform:translate(0,0) rotate(0)} 25%{transform:translate(-2px,0) rotate(-0.5deg)} 75%{transform:translate(1px,-1px) rotate(0.3deg)} }

        .floating-prompt-0 { animation: float-1 4s ease-in-out infinite; }
        .floating-prompt-1 { animation: float-2 3.5s ease-in-out infinite 0.5s; }
        .floating-prompt-2 { animation: float-3 5s ease-in-out infinite 1s; }
        .floating-prompt-3 { animation: float-4 3s ease-in-out infinite 1.5s; }
        .floating-prompt-4 { animation: float-5 4.5s ease-in-out infinite 2s; }
        .floating-prompt-5 { animation: float-6 3.8s ease-in-out infinite 2.5s; }
        .floating-prompt-6 { animation: float-1 3.2s ease-in-out infinite 3s; }
        .floating-prompt-7 { animation: float-2 4.2s ease-in-out infinite 3.5s; }
        .floating-prompt-8 { animation: float-3 3.7s ease-in-out infinite 0.2s; }
        .floating-prompt-9 { animation: float-4 4.8s ease-in-out infinite 0.8s; }
        .floating-prompt-10 { animation: float-5 3.3s ease-in-out infinite 1.2s; }
        .floating-prompt-11 { animation: float-6 4.1s ease-in-out infinite 1.8s; }

        .floating-prompt:hover { animation-play-state: paused; }

        /* Seamless prompt glow: long ease-in/out, no hold (pure crossfade) */
        .prompt-glow{ position: relative; z-index: 0; }
        .prompt-glow::after{
          content: ""; position: absolute; inset: -2px; border-radius: 9999px; pointer-events: none;
          opacity: 0; filter: blur(6px); will-change: opacity;
          background:
            radial-gradient(60px 30px at 30% 35%, var(--glow-color, rgba(99,102,241,0.7)), transparent 70%),
            radial-gradient(60px 30px at 70% 65%, var(--glow-color, rgba(99,102,241,0.7)), transparent 70%);
          background-repeat: no-repeat;
          background-size: 120px 60px, 120px 60px;
          transition: opacity var(--glow-dur, ${HALF_CYCLE_MS}ms) cubic-bezier(0.4, 0, 0.2, 1);
          animation: glow-pan-soft 9.5s ease-in-out infinite alternate;
        }
        .prompt-glow--armed::after{ opacity: 0; }
        .prompt-glow--show::after{ opacity: var(--glow-max, 0.22); }
        .prompt-glow--fadeout::after{ opacity: 0; }

        @keyframes glow-pan-soft{
          0%   { background-position: 26% 40%, 74% 60%; }
          100% { background-position: 34% 30%, 66% 70%; }
        }

        /* Thinking indicator container */
        .thinking-shell{ transition: opacity 220ms ease, transform 220ms ease; opacity: 0; transform: translateY(3px); }
        .thinking-shell[data-show="true"]{ opacity: 1; transform: translateY(0); }

        /* The pill and its glow (clipped) */
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

        /* Subtle glass bubbles */
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
            inset 0 1px 0 rgba(255,255,255,0.04) !important;
        }

        /* Input dock — unchanged */
        .glass-dock{
          position: relative;
          border-radius: 9999px;
          padding: 10px 12px;
          background: transparent;
          border: 0;
          box-shadow: 0 10px 30px rgba(0,0,0,0.35);
          isolation: isolate;
          overflow: visible;
        }
        .glass-dock::before{
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: rgba(0,0,0,0.368);
          backdrop-filter: blur(10px) saturate(120%);
          -webkit-backdrop-filter: blur(10px) saturate(120%);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.06),
            inset 0 -1px 0 rgba(255,255,255,0.03);
          z-index: 0;
        }
        .glass-dock > *{ position: relative; z-index: 1; }

        .glass-dock :is(.surface,.card,[class*="bg-"],[class*="ring-"],[class*="border"],[class*="shadow"],
                        .backdrop-blur,[class*="backdrop-"],[style*="backdrop-filter"]){
          background: transparent !important; box-shadow: none !important; border: 0 !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important;
        }
        .glass-dock :is(.input-wrapper,.input-container,.chat-input,.field,form){ background: transparent !important; box-shadow: none !important; border: 0 !important; }
        .glass-dock:focus-within{ box-shadow: 0 10px 30px rgba(0,0,0,0.35), 0 0 16px 4px hsl(var(--primary)/0.3), 0 0 40px 10px hsl(var(--primary)/0.15) !important; border-radius: 9999px; }
        .glass-dock input, .glass-dock textarea{ font-size: 16px !important; }
        .glass-dock input:-webkit-autofill, .glass-dock textarea:-webkit-autofill{ -webkit-box-shadow: 0 0 0px 1000px transparent inset !important; -webkit-text-fill-color: inherit !important; transition: background-color 999999s ease-in-out 0s !important; }

        /* Tiny sync bubble sizing */
        .sync-bubble, [data-sync-bubble], [data-role="sync-bubble"], .sync-indicator, [data-sync],
        [class*="sync-bubble"], [class*="syncIndicator"], [class*="sync-indicator"]{
          transform: scale(0.9) !important; transform-origin: center !important;
        }
        .sync-bubble svg, [data-sync-bubble] svg, .sync-indicator svg, [data-sync] svg{ width: 0.9em !important; height: 0.9em !important; }
      `}</style>

      {/* Chat History Dialog */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-5xl w-[95vw] h-[85vh] p-0 gap-0 bg-glass/95 backdrop-blur-xl border-glass-border/60 shadow-2xl overflow-hidden">
          <div className="h-full overflow-y-auto">
            <ChatHistoryPanel />
          </div>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-4xl w-[95vw] h-[85vh] p-0 gap-0 bg-glass/95 backdrop-blur-xl border-glass-border/60 shadow-2xl overflow-hidden">
          <div className="h-full overflow-y-auto">
            <SettingsPanel />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}