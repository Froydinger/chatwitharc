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

  const [activeGlowIndex, setActiveGlowIndex] = useState(0);
  const [prevGlowIndex, setPrevGlowIndex] = useState<number | null>(null);

  // Avatar greet animation trigger (fade + slight rotate + pop)
  const [botGreet, setBotGreet] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const { toast } = useToast();
  const { profile } = useAuth();

  // Neon palette for breathing glow cycle
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

  // Prompts — self-contained first messages with explicit "follow up with me" instruction
  const quickPrompts = useMemo(
    () => [
      {
        label: "Wellness check",
        msg:
          "Hi, I’d like to do a short wellness check. Start by asking me to rate my mood from 1–10, then ask me for one word that describes how I feel, then ask what I think caused that mood, and finally suggest two things I could do right now to regulate. Please wait for my answer after each step. If anything is missing, follow up with me with one concise question before continuing."
      },
      {
        label: "Companion chat",
        msg:
          "Can you act as a supportive companion? Begin with one validating sentence about how hard days can feel, then ask me one open question about my day. Keep each reply under three sentences unless I say I want more, and reflect my feelings in one short phrase. If you need context, follow up with me by asking one concise question."
      },
      {
        label: "Creative spark",
        msg:
          "Help me brainstorm one creative idea. Provide a title, three crisp bullet points describing the idea, and one next step I can take today. Then ask me if I want a second variant. If you need more constraints (topic, medium, audience), follow up with me and ask for them explicitly."
      },
      {
        label: "Quick vent",
        msg:
          "I want a space to vent. Let me type freely. When I say I’m done, acknowledge what I said in one sentence, summarize it in one sentence, and then ask me one short follow-up question. Do not give advice unless I ask. If my message is unclear, follow up with me with one clarifying question first."
      },
      {
        label: "Focus sprint",
        msg:
          "Guide me through a 15-minute focus sprint. Step 1: help me define a single finish line in one sentence. Step 2: post a timer message. Step 3: give a three-step plan. Step 4: ask me to confirm start. If you need task details to scope it, follow up with me with one targeted question."
      },
      {
        label: "Gratitude x3",
        msg:
          "Prompt me to share three things I’m grateful for, one at a time. After each, reflect the theme back in one warm sentence. Keep the tone brief and encouraging. If I stall or give very short answers, follow up with me by offering an example and asking one nudge question."
      },
      {
        label: "Idea sketch",
        msg:
          "Help me create a micro brief: 1) Title, 2) Who it helps, 3) Why it matters, 4) How it works in three bullets, 5) First step. After presenting it, ask if I want to tweak or lock it in. If you lack domain or audience info, follow up with me with one concise question to collect it."
      },
      {
        label: "Reframe it",
        msg:
          "Let’s do a cognitive reframe. First ask me to share one stressful thought. Then ask for evidence that supports it and evidence that challenges it. Offer one balanced replacement thought in plain language. If my thought is too broad or vague, follow up with me to narrow it with one specific question."
      },
      {
        label: "Tiny habit",
        msg:
          "Suggest one habit I can do in under two minutes, formatted as: cue → action → reward. Give me two different options labeled A and B and ask me to choose. If the context (morning/evening, home/work) would change your suggestions, follow up with me and ask which context to target."
      },
      {
        label: "Mood check",
        msg:
          "I’d like a quick mood check. Please ask me to rate my mood 1–10 and energy 1–10. Then suggest one regulation tool and one small win I could aim for today. If my scores imply different strategies, follow up with me to confirm which I prefer (calming vs. energizing)."
      },
    ],
    []
  );

  // Cycle breathing glow across pills
  useEffect(() => {
    const interval = setInterval(() => {
      setPrevGlowIndex(activeGlowIndex);
      setActiveGlowIndex((i) => (i + 1) % quickPrompts.length);
      setTimeout(() => setPrevGlowIndex(null), 700);
    }, 2100);
    return () => clearInterval(interval);
  }, [activeGlowIndex, quickPrompts.length]);

  // Smooth scroll on new content (also when loader appears)
  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [messages, isLoading]);

  // Reset scroll on new chat
  useEffect(() => {
    if (messages.length === 0 && messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [currentSessionId, messages.length]);

  // Trigger avatar greet when a new assistant message arrives (fade + rotate + pop)
  useEffect(() => {
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role === "assistant") {
      setBotGreet(false); // restart if triggered quickly
      requestAnimationFrame(() => {
        setBotGreet(true);
        setTimeout(() => setBotGreet(false), 900);
      });
    }
  }, [messages]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
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

  // Spacer so nothing is cut off under the input bar
  const bottomSpacerPx = 180;

  return (
    <div className="flex flex-col h-full w-full max-w-sm sm:max-w-2xl lg:max-w-4xl mx-auto relative pb-1">
      <style>
        {`
          .no-scrollbar::-webkit-scrollbar { width: 0; height: 0; }
          .no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }

          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
          }

          @keyframes breathe {
            0%   { filter: drop-shadow(0 0 0 var(--glow)) drop-shadow(0 0 0 var(--glow-soft)); }
            50%  { filter: drop-shadow(0 0 12px var(--glow)) drop-shadow(0 0 26px var(--glow-soft)); }
            100% { filter: drop-shadow(0 0 0 var(--glow)) drop-shadow(0 0 0 var(--glow-soft)); }
          }

          /* Avatar greet: fade in, slight rotate right, tiny pop, then settle */
          @keyframes helloPop {
            0% {
              opacity: 0;
              transform: rotate(0deg) translateY(0) scale(1);
            }
            25% {
              opacity: 1;
              transform: rotate(8deg) translateY(-2px) scale(1.06);
            }
            60% {
              opacity: 1;
              transform: rotate(-2deg) translateY(0) scale(1.02);
            }
            100% {
              opacity: 1;
              transform: rotate(0deg) translateY(0) scale(1);
            }
          }
          .avatar-greet {
            transform-origin: 50% 80%;
            animation: helloPop 0.9s ease-in-out 1;
          }
          @media (prefers-reduced-motion: reduce) {
            .avatar-greet { animation: none !important; }
          }

          .pill {
            border-radius: 9999px;
            padding: 6px 10px;
            font-size: 12px;
            line-height: 1;
            white-space: nowrap;
            color: hsl(var(--foreground));
            background: rgba(255,255,255,0.03);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            border: 1px solid rgba(23,229,255,0.5); /* 1px neon-blue outline at 50% */
            transition: transform 180ms ease, background 180ms ease, border-color 180ms ease, filter 420ms ease, opacity 420ms ease;
          }
          .pill:hover { transform: translateY(-1px); }

          .glow-wrap {
            position: relative;
            display: inline-flex;
            border-radius: 9999px;
            transition: opacity 600ms ease;
          }
          .glow-wrap.active {
            --glow: var(--glow-color);
            --glow-soft: color-mix(in oklab, var(--glow) 50%, transparent);
            animation: breathe 2s ease-in-out infinite;
          }
          .glow-wrap.prev {
            --glow: var(--glow-color);
            --glow-soft: color-mix(in oklab, var(--glow) 50%, transparent);
            animation: breathe 2s ease-in-out infinite;
            opacity: 0.0;
          }
        `}
      </style>

      {/* Header gradient (original smooth fade + stacked blur) */}
      <div className="fixed top-0 left-0 right-0 z-30 h-32 pointer-events-none">
        <div 
          className="w-full h-full"
          style={{
            background: `linear-gradient(to bottom, 
              hsl(var(--background)) 0%, 
              hsl(var(--background) / 0.98) 15%,
              hsl(var(--background) / 0.92) 30%,
              hsl(var(--background) / 0.8) 45%,
              hsl(var(--background) / 0.6) 60%,
              hsl(var(--background) / 0.3) 75%,
              hsl(var(--background) / 0.1) 90%,
              transparent 100%)`,
            backdropFilter: "blur(0px) blur(5px) blur(10px) blur(15px) blur(20px)",
            WebkitBackdropFilter: "blur(0px) blur(5px) blur(10px) blur(15px) blur(20px)",
            maskImage: `linear-gradient(to bottom, 
              black 0%, 
              rgba(0,0,0,0.8) 40%,
              rgba(0,0,0,0.4) 70%,
              transparent 100%)`
          }}
        />
      </div>

      {/* Header content — using the same icon as the welcome icon */}
      <div className="fixed top-0 left-0 right-0 z-40 flex justify-center pointer-events-none">
        <div className="w-full max-w-sm sm:max-w-2xl lg:max-w-4xl pointer-events-auto">
          <div className="flex items-center justify-between px-2 py-2">
            <div className="flex items-center gap-2">
              <img
                src="/lovable-uploads/72a60af7-4760-4f2e-9000-1ca90800ae61.png"
                alt="ArcAI"
                className={`h-7 w-7 ${botGreet ? "avatar-greet" : ""}`}
              />
              <span className="text-foreground font-semibold text-sm sm:text-base">
                ArcAI
              </span>
            </div>
            <GlassButton
              variant="bubble"
              size="icon"
              aria-label="New chat"
              onClick={handleNewChat}
              className="h-8 w-8"
            >
              <Plus className="h-4 w-4" />
            </GlassButton>
          </div>
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
          <div className="px-3 sm:px-4 pt-20 w-full max-w-full">
            {/* Empty state with BIGGER welcome icon + PROMPTS */}
            {messages.length === 0 ? (
              <div className="text-center">
                <div className="flex items-center justify-center mb-2" style={{ animation: "fadeInUp 420ms ease both" }}>
                  <img
                    src="/lovable-uploads/72a60af7-4760-4f2e-9000-1ca90800ae61.png"
                    alt="ArcAI"
                    className={`h-20 w-20 ${botGreet ? "avatar-greet" : ""}`}
                  />
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-foreground">
                  Welcome to ArcAI
                </h3>
                <p className="text-[11px] sm:text-xs text-muted-foreground mb-2">
                  Tap a prompt to begin.
                </p>

                {/* PROMPTS */}
                <div className="mx-auto max-w-3xl">
                  <div className="flex flex-wrap items-center justify-center gap-4 py-4">
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
                            opacity: isActive ? 1 : isPrev ? 0.4 : 1,
                            transition: "opacity 700ms ease",
                            ["--glow-color" as any]: isPrev ? prevColor : color,
                            animation: `fadeInUp 420ms ease ${idx * 28}ms both`
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

                {isLoading && (
                  <div className="flex justify-center pt-2">
                    <div className="glass rounded-2xl px-3 py-2 max-w-xs" style={{ animation: "fadeInUp 300ms ease both" }}>
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
              </div>
            ) : (
              <>
                {/* Messages */}
                <div className="space-y-4">
                  {messages.map((message) => (
                    <MessageBubble key={message.id} message={message} onEdit={() => {}} />
                  ))}
                </div>

                {/* Centered thinking indicator directly under the last message */}
                {isLoading && (
                  <div className="flex justify-center mt-3">
                    <div className="glass rounded-2xl px-3 py-2 max-w-xs" style={{ animation: "fadeInUp 300ms ease both" }}>
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

                {/* Spacer so messages + loader never get cut off by the input bar */}
                <div style={{ height: bottomSpacerPx }} />
                <div ref={messagesEndRef} />
              </>
            )}
          </div>
        </div>

        {/* Drag overlay */}
        {dragOver && (
          <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary-glow rounded-[var(--radius)] flex items-center justify-center">
            <div className="text-center" style={{ animation: "fadeInUp 300ms ease both" }}>
              <Image className="h-10 w-10 text-primary-glow mx-auto mb-2" />
              <p className="text-primary-foreground font-medium text-sm">Drop images here</p>
            </div>
          </div>
        )}
      </GlassCard>
    </div>
  );
}