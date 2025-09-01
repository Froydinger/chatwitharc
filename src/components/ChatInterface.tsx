import { useState, useRef, useEffect, useMemo } from "react";
import { Image, Plus, SlidersHorizontal } from "lucide-react";
import { useArcStore } from "@/store/useArcStore";
import { OpenAIService } from "@/services/openai";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { MessageBubble } from "@/components/MessageBubble";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

/**
 * Goals in this version:
 * - One-screen, no-scroll welcome on phone and desktop by default.
 * - Keep your original smooth header fade + stacked blur.
 * - Neon pills with thin 1px neon-blue outline, glow that breathes and moves to the next pill.
 * - Smoother animations overall.
 * - Denser cluster with responsive gap/padding using CSS variables and clamp().
 * - A tiny "Density" control in header to cycle Comfy → Cozy → Compact without code changes.
 * - When messages exist, add bottom spacer so last bubble never hides under the input.
 * - Header layout: logo + title on one line, subtitle sits to the right on wide screens and drops under on small screens.
 */

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

  // Density control: comfy → cozy → compact
  const densityLevels = ["comfy", "cozy", "compact"] as const;
  const [density, setDensity] = useState<typeof densityLevels[number]>("cozy");

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

  // Prompts: short labels, explicit step-by-step messages to overcome "keep it short" instruction
  const quickPrompts = useMemo(
    () => [
      {
        label: "Wellness check",
        msg:
          "Run a wellness check. Step 1 ask for mood 1-10. Step 2 ask for one word. Step 3 ask for one trigger. Step 4 offer two regulation options. Keep compact. Wait for my reply after each step."
      },
      {
        label: "Companion chat",
        msg:
          "Be a supportive companion. Start with one validating sentence. Ask one open question. Keep under 3 sentences unless I say continue. Reflect my feeling in one phrase."
      },
      {
        label: "Creative spark",
        msg:
          "Brainstorm one idea. Give a title, three bullets, and one next step. Ask if I want a second variant. Keep specific and concise."
      },
      {
        label: "Quick vent",
        msg:
          "Let me vent for 2 minutes. Acknowledge in one sentence. Summarize in one sentence. Ask one follow-up. No advice unless I ask."
      },
      {
        label: "Focus sprint",
        msg:
          "Guide a 15 minute sprint. Step 1 define a single finish line in one sentence. Step 2 set a timer message. Step 3 give a three-step plan. Step 4 ask to start."
      },
      {
        label: "Gratitude x3",
        msg:
          "Prompt three gratitude items one at a time. After each, reflect a short theme in one sentence. Keep warm and brief."
      },
      {
        label: "Idea sketch",
        msg:
          "Make a micro brief: Title. Who it helps. Why it matters. How it works in 3 bullets. First step. Then ask me to tweak or lock in."
      },
      {
        label: "Reframe it",
        msg:
          "Cognitive reframe. Ask me to state a stressful thought. Ask for evidence for and against. Offer one balanced replacement thought. Keep tight."
      },
      {
        label: "Tiny habit",
        msg:
          "Suggest one habit under 2 minutes using cue, action, reward. Offer two options and ask me to pick A or B."
      },
      {
        label: "Mood check",
        msg:
          "Do a quick mood check. Step 1 mood 1-10. Step 2 energy 1-10. Step 3 suggest one regulation tool and one tiny win for today."
      },
    ],
    []
  );

  // Move the breathing glow from one pill to the next and change color
  useEffect(() => {
    const interval = setInterval(() => {
      setPrevGlowIndex(activeGlowIndex);
      setActiveGlowIndex((i) => (i + 1) % quickPrompts.length);
      // clear prev index after crossfade
      setTimeout(() => setPrevGlowIndex(null), 700);
    }, 2100); // slower, smoother cycle
    return () => clearInterval(interval);
  }, [activeGlowIndex, quickPrompts.length]);

  // Smooth scroll behavior
  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
  const bottomSpacerPx = 104; // tune to your input bar height

  // Cycle density helper
  const cycleDensity = () => {
    const idx = densityLevels.indexOf(density);
    setDensity(densityLevels[(idx + 1) % densityLevels.length]);
  };

  return (
    <div
      className="flex flex-col h-full w-full max-w-sm sm:max-w-2xl lg:max-w-4xl mx-auto relative pb-1"
      data-density={density}
    >
      {/* Local styles: responsive density variables, header fade, pill glow, softer motions */}
      <style>
        {`
          /* Density presets: tweak gaps, pill size, and cluster width without code changes */
          :root {
            --cluster-gap: 24px;
            --cluster-gap-sm: 16px;
            --pill-x: 12px;
            --pill-y: 8px;
            --pill-font: 12px;
            --cluster-max: 48rem; /* controls when cluster wraps; 48rem ≈ 768px */
            --header-pad: 8px;
            --logo-size: 28px;
            --title-size: 16px;
            --subtitle-size: 12px;
          }
          [data-density="comfy"] {
            --cluster-gap: clamp(18px, 2.2dvh, 28px);
            --cluster-gap-sm: clamp(12px, 1.6dvh, 18px);
            --pill-x: clamp(12px, 1.4dvh, 14px);
            --pill-y: clamp(8px, 1.0dvh, 10px);
            --pill-font: clamp(12px, 0.88rem, 14px);
            --cluster-max: 52rem;
            --header-pad: 10px;
            --logo-size: 30px;
            --title-size: 17px;
            --subtitle-size: 12px;
          }
          [data-density="cozy"] {
            --cluster-gap: clamp(14px, 1.8dvh, 22px);
            --cluster-gap-sm: clamp(10px, 1.2dvh, 16px);
            --pill-x: clamp(10px, 1.2dvh, 12px);
            --pill-y: clamp(7px, 0.9dvh, 9px);
            --pill-font: clamp(12px, 0.84rem, 13px);
            --cluster-max: 44rem;
            --header-pad: 8px;
            --logo-size: 28px;
            --title-size: 16px;
            --subtitle-size: 11px;
          }
          [data-density="compact"] {
            --cluster-gap: clamp(8px, 1.2dvh, 14px);
            --cluster-gap-sm: clamp(6px, 0.8dvh, 12px);
            --pill-x: clamp(8px, 1.0dvh, 10px);
            --pill-y: clamp(6px, 0.8dvh, 8px);
            --pill-font: clamp(11px, 0.8rem, 12px);
            --cluster-max: 38rem;
            --header-pad: 6px;
            --logo-size: 26px;
            --title-size: 15px;
            --subtitle-size: 11px;
          }

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

          .pill {
            border-radius: 9999px;
            padding: var(--pill-y) var(--pill-x);
            font-size: var(--pill-font);
            line-height: 1;
            white-space: nowrap;
            color: hsl(var(--foreground));
            background: rgba(255,255,255,0.03);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            border: 1px solid rgba(23,229,255,0.5); /* 1px neon-blue outline at 50% */
            transition: transform 180ms ease, background 180ms ease, border-color 180ms ease, filter 420ms ease, opacity 420ms ease;
            will-change: transform, filter, opacity;
          }
          .pill:hover { transform: translateY(-1px); }

          .glow-wrap {
            position: relative;
            display: inline-flex;
            border-radius: 9999px;
            transition: opacity 600ms ease;
            will-change: filter, opacity;
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
            opacity: 0.0; /* cross-fade handled inline */
          }
        `}
      </style>

      {/* Gradient Header Mask — original smooth fade + stacked blurs */}
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

      {/* Header content: logo + title left, density + new chat right.
          Subtitle sits inline on wide, wraps under on small for height savings. */}
      <div className="fixed top-0 left-0 right-0 z-40 flex justify-center pointer-events-none">
        <div className="w-full max-w-sm sm:max-w-2xl lg:max-w-4xl pointer-events-auto">
          <div className="flex items-center justify-between px-2 py-[var(--header-pad)]">
            <div className="flex items-center min-w-0 gap-2">
              <img
                src="/lovable-uploads/10805bee-4d5c-4640-a77f-d2ea5cd05436.png"
                alt="ArcAI"
                style={{ width: "var(--logo-size)", height: "var(--logo-size)" }}
              />
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-foreground font-semibold" style={{ fontSize: "var(--title-size)" }}>
                  ArcAI
                </span>
                <span className="text-muted-foreground truncate" style={{ fontSize: "var(--subtitle-size)" }}>
                  Creative wellness assistant
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <GlassButton
                variant="bubble"
                size="icon"
                aria-label="Cycle density"
                className="h-8 w-8"
                onClick={cycleDensity}
                title={`Density: ${density}`}
              >
                <SlidersHorizontal className="h-4 w-4" />
              </GlassButton>
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
            {/* Empty state with pill cluster that fits one screen on phone and desktop */}
            {messages.length === 0 ? (
              <div className="text-center">
                {/* Header mini row for welcome can stack without adding height */}
                <div className="flex items-center justify-center gap-2 mb-1" style={{ animation: "fadeInUp 420ms ease both" }}>
                  <img src="/lovable-uploads/72a60af7-4760-4f2e-9000-1ca90800ae61.png" alt="ArcAI" className="h-8 w-8" />
                  <h3 className="text-sm sm:text-base font-semibold text-foreground">
                    Welcome to ArcAI
                  </h3>
                </div>
                <p className="text-[11px] sm:text-xs text-muted-foreground mb-2" style={{ animation: "fadeInUp 420ms ease 40ms both" }}>
                  Tap a prompt to begin.
                </p>

                {/* Cluster: dense, clean, fits one screen using clamp() and a max width cap */}
                <div className="mx-auto" style={{ maxWidth: "var(--cluster-max)" }}>
                  <div
                    className="flex flex-wrap items-center justify-center"
                    style={{
                      gap: "var(--cluster-gap)",
                      rowGap: "var(--cluster-gap-sm)",
                      paddingTop: "clamp(8px, 1.6dvh, 16px)",
                      paddingBottom: "clamp(8px, 1.6dvh, 16px)"
                    }}
                  >
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

                {/* No extra bottom padding so it stays one page */}
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
                <div className="glass rounded-2xl px-3 py-2 max-w-xs" style={{ animation: "fadeInUp 360ms ease both" }}>
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