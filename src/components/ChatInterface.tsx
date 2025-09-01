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
    startChatWithMessage,
    addMessage, // ⬅️ we’ll inject a hidden system/internal message before sending the cue
  } = useArcStore();

  const [dragOver, setDragOver] = useState(false);
  const [activeGlowIndex, setActiveGlowIndex] = useState(0);
  const [prevGlowIndex, setPrevGlowIndex] = useState<number | null>(null);
  const [botGreet, setBotGreet] = useState(false); // avatar greet animation

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

  /** Prompts — cue (short, visible) + ctx (long, internal system message)
   * We’ll add ctx as an INTERNAL system message (not rendered), then send the cue normally.
   * This keeps UI clean while the model still gets rich guidance.
   */
  const quickPrompts = useMemo(
    () => [
      {
        label: "Wellness check",
        cue: "Wellness check",
        ctx:
`Run a structured wellness check with sequential turns.
Step 1) Ask me to rate my mood from 1–10 and wait.
Step 2) Ask me for ONE word that describes how I feel and wait.
Step 3) Ask what I think contributed to that mood and wait.
Step 4) Suggest exactly TWO right-now regulation options (brief, actionable); invite me to pick one.
Tone: warm, concise, non-judgmental. If anything is unclear or missing, follow up with me with ONE concise question before continuing.`
      },
      {
        label: "Companion chat",
        cue: "Let’s chat",
        ctx:
`Act as a supportive companion.
Open with ONE validating sentence (no clichés), then ask ONE open question about my day.
Keep replies ≤3 sentences unless I ask for more. Mirror my emotion in one short phrase each turn.
If context is missing, follow up with me by asking ONE concise question to ground the conversation.`
      },
      {
        label: "Creative spark",
        cue: "One creative idea",
        ctx:
`Brainstorm exactly ONE creative idea.
Return format:
• Title
• Three crisp bullets (what it is, who it’s for, how it’s novel)
• One next step I can take today
Then ask if I want a second variant.
If topic/medium/audience are missing, follow up with me and ask for those constraints explicitly.`
      },
      {
        label: "Quick vent",
        cue: "I want to vent",
        ctx:
`Provide a space to vent.
Let me type freely; when I indicate I’m done, do:
• Acknowledge in one sentence
• Summarize in one sentence
• Ask ONE short follow-up question
Do NOT give advice unless I ask. If my message is unclear, follow up with me with ONE clarifying question first.`
      },
      {
        label: "Focus sprint",
        cue: "Start a 15-min sprint",
        ctx:
`Guide a 15-minute focus sprint.
1) Help me define a single finish line in one sentence; wait.
2) Post a lightweight timer message.
3) Provide a 3-step plan.
4) Ask me to confirm start.
If task details are missing, follow up with me with ONE targeted scoping question.`
      },
      {
        label: "Gratitude ×3",
        cue: "Do gratitude",
        ctx:
`Run a three-item gratitude exercise, one at a time.
After each item, reflect the theme back in ONE warm sentence.
Keep tone brief and encouraging.
If I stall or give ultra-short answers, follow up with me by offering ONE concrete example and ONE nudge question.`
      },
      {
        label: "Idea sketch",
        cue: "Micro brief",
        ctx:
`Create a micro brief:
1) Title
2) Who it helps
3) Why it matters
4) How it works (3 bullets)
5) First step
Then ask if I want to tweak or lock it in.
If domain or audience are missing, follow up with me with ONE concise question to collect it.`
      },
      {
        label: "Reframe it",
        cue: "Help me reframe",
        ctx:
`Cognitive reframe flow:
• Ask me to share ONE stressful thought; wait.
• Ask for evidence supporting it and evidence challenging it; wait.
• Offer ONE balanced replacement thought in plain language.
If my thought is too broad, follow up with me with ONE question to narrow it.`
      },
      {
        label: "Tiny habit",
        cue: "Suggest a tiny habit",
        ctx:
`Propose ONE sub-2-minute habit as cue → action → reward.
Offer two different options (A and B) and ask me to choose.
If context (morning/evening, home/work) matters, follow up with me to pick the target context first.`
      },
      {
        label: "Mood check",
        cue: "Quick mood check",
        ctx:
`Ask me to rate mood 1–10 and energy 1–10; wait.
Suggest ONE regulation tool and ONE small win for today.
If my scores point to different strategies, follow up with me to confirm preference (calming vs. energizing).`
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

  // Trigger avatar greet when a new assistant message arrives
  useEffect(() => {
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role === "assistant") {
      setBotGreet(false);
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

  /** 🔐 Option 1: Two-message injection (cleanest)
   *  1) Push an INTERNAL system message with the long guidance (not rendered)
   *  2) Send the short cue normally via startChatWithMessage()
   * Assumes your backend composes messages from the store (common pattern).
   */
  const triggerPrompt = (cue: string, guidance: string) => {
    // 1) Hidden system/internal guidance (filter out from UI)
    addMessage({
      id: `${Date.now()}-sys`,
      role: "system",
      content: guidance,
      // @ts-ignore allow extra flag
      internal: true,
    });
    // 2) Now send the visible cue (this will render as the user bubble + kick off completion)
    startChatWithMessage(cue);
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
            0% { opacity: 0; transform: rotate(0deg) translateY(0) scale(1); }
            25% { opacity: 1; transform: rotate(8deg) translateY(-2px) scale(1.06); }
            60% { opacity: 1; transform: rotate(-2deg) translateY(0) scale(1.02); }
            100% { opacity: 1; transform: rotate(0deg) translateY(0) scale(1); }
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
        <div className="w-full max-w-sm sm:max-w-2xl lg=max-w-4xl pointer-events-auto">
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
                          onClick={() => triggerPrompt(p.cue, p.ctx)}
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
                {/* Messages (filter out internal/system guidance so user doesn't see it) */}
                <div className="space-y-4">
                  {messages
                    .filter((m: any) => !m.internal) // hide our injected guidance
                    .map((message) => (
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