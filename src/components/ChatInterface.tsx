import { useState, useRef, useEffect, useMemo } from "react";
import { Image, Plus } from "lucide-react";
import { useArcStore } from "@/store/useArcStore";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { MessageBubble } from "@/components/MessageBubble";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

export function ChatInterface() {
  const { 
    messages, 
    isLoading, 
    createNewSession,
    currentSessionId,
    startChatWithMessage 
  } = useArcStore();

  const [dragOver, setDragOver] = useState(false);

  // active glow indexes to cross-fade color between pills
  const [activeGlowIndex, setActiveGlowIndex] = useState(0);
  const [prevGlowIndex, setPrevGlowIndex] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const { toast } = useToast();
  const { profile } = useAuth();

  // Neon palette that the glow cycles through
  const neonPalette = useMemo(
    () => [
      "#17E5FF", // neon blue
      "#FF2B2B", // neon red
      "#2BFF7A", // neon green
      "#FF3CF3", // neon pink
      "#FF8A00", // neon orange
      "#8A7BFF", // neon violet
      "#00FFC2", // mint
    ],
    []
  );

  // Compact single page prompts (top 3 included here)
  const quickPrompts = useMemo(
    () => [
      { label: "Wellness check", msg: "I'd like a mental wellness check-in. How are you feeling today and what's on your mind?" },
      { label: "Friendly companion", msg: "I need someone to talk to today. Can you be a supportive companion?" },
      { label: "Creative spark", msg: "Let's get creative! Help me brainstorm some ideas or work on a creative project." },
      { label: "Quick vent", msg: "I want to vent for 2 minutes. Just listen and reflect back key feelings." },
      { label: "Focus sprint", msg: "Guide me through a 15 minute focus sprint with a timer and one goal." },
      { label: "Gratitude x3", msg: "Give me three gratitude prompts and wait for my answers one by one." },
      { label: "Idea sketch", msg: "Help me sketch one idea with a title, 3 bullets, and next step." },
      { label: "Reframe it", msg: "Help me reframe a stressful thought using CBT style questions." },
      { label: "Tiny habit", msg: "Suggest one tiny habit I can do daily in under 2 minutes." },
      { label: "Mood check", msg: "Do a quick mood check using 1 to 10, then suggest one regulation tool." },
    ],
    []
  );

  // Move the breathing glow from one pill to the next and change color
  useEffect(() => {
    const interval = setInterval(() => {
      setPrevGlowIndex((prev) => activeGlowIndex);
      setActiveGlowIndex((i) => (i + 1) % quickPrompts.length);
      // remove the previous index after a short crossfade
      setTimeout(() => setPrevGlowIndex(null), 450);
    }, 1600);
    return () => clearInterval(interval);
  }, [activeGlowIndex, quickPrompts.length]);

  // Scroll behavior
  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Reset scroll on new chat
  useEffect(() => {
    if (messages.length === 0 && messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [currentSessionId, messages.length]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    // file handling here if needed
  };

  const handleNewChat = () => {
    createNewSession();
    requestAnimationFrame(() => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTo({ top: 0, behavior: "instant" });
        messagesContainerRef.current.scrollTop = 0;
      }
    });
    toast({ title: "New Chat Started", description: "Ready for a fresh conversation!" });
  };

  // Height spacer so bottom message never hides behind the input bar
  const bottomSpacerPx = 96; // tune to your input bar height

  return (
    <div className="flex flex-col h-full w-full max-w-sm sm:max-w-2xl lg:max-w-4xl mx-auto relative pb-1">
      {/* Local styles for clean cluster, thin outline, breathing glow, and fade-in */}
      <style>
        {`
          .no-scrollbar::-webkit-scrollbar { width: 0; height: 0; }
          .no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }

          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(6px); }
            to { opacity: 1; transform: translateY(0); }
          }

          @keyframes breathe {
            0%   { filter: drop-shadow(0 0 0 var(--glow)) drop-shadow(0 0 0 var(--glow-soft)); }
            50%  { filter: drop-shadow(0 0 10px var(--glow)) drop-shadow(0 0 22px var(--glow-soft)); }
            100% { filter: drop-shadow(0 0 0 var(--glow)) drop-shadow(0 0 0 var(--glow-soft)); }
          }

          .pill {
            border-radius: 9999px;
            padding: 8px 12px;
            font-size: 12px;
            line-height: 1;
            white-space: nowrap;
            color: hsl(var(--foreground));
            background: rgba(255,255,255,0.03);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            border: 1px solid rgba(23,229,255,0.5); /* 1px neon-blue outline at 50% */
            transition: transform 120ms ease, background 120ms ease, border-color 120ms ease, filter 300ms ease, opacity 300ms ease;
          }
          .pill:hover { transform: translateY(-1px); }

          /* Glow carrier wraps the button, stays stationary. Only active/prev carry the breathing glow + color. */
          .glow-wrap {
            position: relative;
            display: inline-flex;
            border-radius: 9999px;
          }
          .glow-wrap.active {
            --glow: var(--glow-color);
            --glow-soft: color-mix(in oklab, var(--glow) 50%, transparent);
            animation: breathe 1.6s ease-in-out infinite;
          }
          .glow-wrap.prev {
            --glow: var(--glow-color);
            --glow-soft: color-mix(in oklab, var(--glow) 50%, transparent);
            animation: breathe 1.6s ease-in-out infinite;
            opacity: 0.0; /* will be animated via inline style for crossfade */
          }
        `}
      </style>

      {/* Compact gradient header */}
      <div className="fixed top-0 left-0 right-0 z-30 h-16 pointer-events-none">
        <div 
          className="w-full h-full"
          style={{
            background: `linear-gradient(to bottom, hsl(var(--background)) 0%, hsl(var(--background) / 0.9) 40%, transparent 100%)`,
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
        />
      </div>

      {/* Header content */}
      <div className="fixed top-0 left-0 right-0 z-40 flex justify-center pointer-events-none">
        <div className="w-full max-w-sm sm:max-w-2xl lg:max-w-4xl flex justify-between items-center p-2 pointer-events-auto">
          <img src="/lovable-uploads/10805bee-4d5c-4640-a77f-d2ea5cd05436.png" alt="ArcAI" className="h-7 w-7" />
          <GlassButton variant="bubble" size="icon" onClick={handleNewChat} className="h-9 w-9">
            <Plus className="h-4 w-4" />
          </GlassButton>
        </div>
      </div>

      {/* Messages Container */}
      <GlassCard 
        variant="bubble" 
        glow
        className={`flex-1 mx-2 mb-2 overflow-hidden ${dragOver ? "border-primary-glow border-2" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <div ref={messagesContainerRef} className="h-full overflow-y-auto no-scrollbar scroll-smooth relative">
          <div className="px-3 sm:px-4 pt-14 w-full max-w-full">
            {/* Empty state: single-page compact cluster of pills */}
            {messages.length === 0 ? (
              <div className="text-center">
                <div className="flex justify-center mb-2">
                  <img src="/lovable-uploads/72a60af7-4760-4f2e-9000-1ca90800ae61.png" alt="ArcAI" className="h-10 w-10" />
                </div>
                <h3 className="text-base font-semibold text-foreground mb-1">Welcome to ArcAI</h3>
                <p className="text-xs text-muted-foreground mb-2">Tap a prompt to begin.</p>

                {/* Cluster: tight, clean, one-screen */}
                <div className="max-w-xl mx-auto">
                  <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-8 py-4">
                    {quickPrompts.map((p, idx) => {
                      const isActive = idx === activeGlowIndex;
                      const isPrev = prevGlowIndex === idx;
                      const color = neonPalette[activeGlowIndex % neonPalette.length];
                      const prevColor = neonPalette[(activeGlowIndex - 1 + neonPalette.length) % neonPalette.length];

                      return (
                        <div
                          key={idx}
                          className={
                            "glow-wrap" +
                            (isActive ? " active" : "") +
                            (isPrev ? " prev" : "")
                          }
                          style={{
                            // crossfade previous glow out smoothly, keep active fully visible
                            opacity: isActive ? 1 : isPrev ? 0.35 : 1,
                            transition: "opacity 420ms ease",
                            // pass the current color via CSS var
                            // for prev, show the previous color to make the fade between hues feel smooth
                            ["--glow-color" as any]: isPrev ? prevColor : color,
                            // fade-in on mount with stagger
                            animation: `fadeInUp 340ms ease ${idx * 30}ms both`
                          }}
                          onClick={() => startChatWithMessage(p.msg)}
                        >
                          <button className="pill" aria-label={p.label}>
                            {p.label}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* tiny bottom pad so cluster breathes without scroll */}
                <div className="pb-6" />
              </div>
            ) : (
              <>
                <div className="space-y-4 pb-6">
                  {messages.map((message) => (
                    <MessageBubble key={message.id} message={message} onEdit={() => {}} />
                  ))}
                </div>
                {/* Spacer so last message never sits under the input bar */}
                <div style={{ height: bottomSpacerPx }} />
              </>
            )}

            {/* Loading bubble */}
            {isLoading && (
              <div className="flex justify-start pb-3">
                <div className="glass rounded-2xl px-3 py-2 max-w-xs">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="w-2 h-2 bg-primary-glow rounded-full animate-pulse" />
                      ))}
                    </div>
                    <span className="text-xs text-muted-foreground">Thinking...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} className="pb-2" />
          </div>
        </div>

        {/* Drag overlay */}
        {dragOver && (
          <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary-glow rounded-[var(--radius)] flex items-center justify-center">
            <div className="text-center">
              <Image className="h-10 w-10 text-primary-glow mx-auto mb-2" />
              <p className="text-primary-foreground font-medium text-sm">Drop images here</p>
            </div>
          </div>
        )}
      </GlassCard>
    </div>
  );
}