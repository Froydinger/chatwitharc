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

  // Robot avatar nod state
  const [botNod, setBotNod] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const { toast } = useToast();
  const { profile } = useAuth();

  const neonPalette = useMemo(
    () => [
      "#17E5FF",
      "#FF2B2B",
      "#2BFF7A",
      "#FF3CF3",
      "#FF8A00",
      "#8A7BFF",
      "#00FFC2",
    ],
    []
  );

  const quickPrompts = useMemo(
    () => [
      { label: "Wellness check", msg: "Run a wellness check. Step 1 ask for mood 1-10. Step 2 ask for one word. Step 3 ask for one trigger. Step 4 offer two regulation options. Keep compact. Wait for my reply after each step." },
      { label: "Companion chat", msg: "Be a supportive companion. Start with one validating sentence. Ask one open question. Keep under 3 sentences unless I say continue. Reflect my feeling in one phrase." },
      { label: "Creative spark", msg: "Brainstorm one idea. Give a title, three bullets, and one next step. Ask if I want a second variant. Keep specific and concise." },
      { label: "Quick vent", msg: "Let me vent for 2 minutes. Acknowledge in one sentence. Summarize in one sentence. Ask one follow-up. No advice unless I ask." },
      { label: "Focus sprint", msg: "Guide a 15 minute sprint. Step 1 define a single finish line in one sentence. Step 2 set a timer message. Step 3 give a three-step plan. Step 4 ask to start." },
      { label: "Gratitude x3", msg: "Prompt three gratitude items one at a time. After each, reflect a short theme in one sentence. Keep warm and brief." },
      { label: "Idea sketch", msg: "Make a micro brief: Title. Who it helps. Why it matters. How it works in 3 bullets. First step. Then ask me to tweak or lock in." },
      { label: "Reframe it", msg: "Cognitive reframe. Ask me to state a stressful thought. Ask for evidence for and against. Offer one balanced replacement thought. Keep tight." },
      { label: "Tiny habit", msg: "Suggest one habit under 2 minutes using cue, action, reward. Offer two options and ask me to pick A or B." },
      { label: "Mood check", msg: "Do a quick mood check. Step 1 mood 1-10. Step 2 energy 1-10. Step 3 suggest one regulation tool and one tiny win for today." },
    ],
    []
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setPrevGlowIndex(activeGlowIndex);
      setActiveGlowIndex((i) => (i + 1) % quickPrompts.length);
      setTimeout(() => setPrevGlowIndex(null), 700);
    }, 2100);
    return () => clearInterval(interval);
  }, [activeGlowIndex, quickPrompts.length]);

  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [messages, isLoading]);

  useEffect(() => {
    if (messages.length === 0 && messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [currentSessionId, messages.length]);

  // Trigger robot avatar nod when new assistant message arrives
  useEffect(() => {
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role === "assistant") {
      setBotNod(true);
      const t = setTimeout(() => setBotNod(false), 900);
      return () => clearTimeout(t);
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

  const bottomSpacerPx = 180;

  return (
    <div className="flex flex-col h-full w-full max-w-sm sm:max-w-2xl lg:max-w-4xl mx-auto relative pb-1">
      <style>
        {`
          .robot-nod {
            transform-origin: 50% 80%;
            animation: nod 0.9s ease-in-out 1;
          }
          @keyframes nod {
            0%   { transform: rotate(0deg); }
            20%  { transform: rotate(8deg); }
            40%  { transform: rotate(-6deg); }
            60%  { transform: rotate(4deg); }
            80%  { transform: rotate(-2deg); }
            100% { transform: rotate(0deg); }
          }
        `}
      </style>

      {/* Header content */}
      <div className="fixed top-0 left-0 right-0 z-40 flex justify-center pointer-events-none">
        <div className="w-full max-w-sm sm:max-w-2xl lg:max-w-4xl pointer-events-auto">
          <div className="flex items-center justify-between px-2 py-2">
            <div className="flex items-center gap-2">
              {/* Use welcome icon in header */}
              <img
                src="/lovable-uploads/72a60af7-4760-4f2e-9000-1ca90800ae61.png"
                alt="ArcAI"
                className={`h-7 w-7 ${botNod ? "robot-nod" : ""}`}
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
            {messages.length === 0 ? (
              <div className="text-center">
                {/* Bigger welcome icon */}
                <div className="flex items-center justify-center mb-2" style={{ animation: "fadeInUp 420ms ease both" }}>
                  <img
                    src="/lovable-uploads/72a60af7-4760-4f2e-9000-1ca90800ae61.png"
                    alt="ArcAI"
                    className={`h-20 w-20 ${botNod ? "robot-nod" : ""}`}
                  />
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-foreground">
                  Welcome to ArcAI
                </h3>
                <p className="text-[11px] sm:text-xs text-muted-foreground mb-2">
                  Tap a prompt to begin.
                </p>
                {/* Prompts here... */}
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {messages.map((message) => (
                    <MessageBubble key={message.id} message={message} onEdit={() => {}} />
                  ))}
                </div>
                {isLoading && (
                  <div className="flex justify-center mt-3">
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
                <div style={{ height: bottomSpacerPx }} />
                <div ref={messagesEndRef} />
              </>
            )}
          </div>
        </div>
      </GlassCard>
    </div>
  );
}