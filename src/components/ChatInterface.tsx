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
  const [botGreet, setBotGreet] = useState(false); // avatar greet animation

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

  /** Prompts — full messages sent directly as user content */
  const quickPrompts = useMemo(
    () => [
      {
        label: "Wellness check",
        msg:
`Hi, I’d like to do a short wellness check. 
Start by asking me to rate my mood from 1–10. 
Then ask me for one word that describes how I feel. 
Then ask me what I think contributed to that mood. 
Finally, suggest exactly two regulation options I could do right now and invite me to pick one. 
If anything is unclear, follow up with me with one concise question.`
      },
      {
        label: "Companion chat",
        msg:
`Can you act as a supportive companion? 
Begin with one validating sentence about how hard days can feel. 
Then ask me one open question about my day. 
Keep replies under three sentences unless I ask for more. 
Please reflect my feelings in one short phrase each time. 
If you’re missing context, follow up with me with one clarifying question.`
      },
      {
        label: "Creative spark",
        msg:
`Help me brainstorm one creative idea. 
Give me a title, three bullet points describing the idea, and one next step I could take today. 
After that, ask me if I’d like a second variant. 
If you’re missing details like topic, medium, or audience, follow up with me first.`
      },
      {
        label: "Quick vent",
        msg:
`I want to vent. 
Please let me type freely; when I say I’m done: 
• Acknowledge in one sentence 
• Summarize in one sentence 
• Ask one short follow-up question 
Do not give advice unless I ask. 
If my message is unclear, follow up with one clarifying question.`
      },
      {
        label: "Focus sprint",
        msg:
`Guide me through a 15-minute focus sprint. 
Step 1: Help me define a single finish line in one sentence. 
Step 2: Post a timer message. 
Step 3: Give me a three-step plan. 
Step 4: Ask me to confirm I’m ready to start. 
If details are missing, follow up with me with one scoping question.`
      },
      {
        label: "Gratitude ×3",
        msg:
`Prompt me to share three things I’m grateful for, one at a time. 
After each, reflect the theme back in one warm sentence. 
Keep it brief but encouraging. 
If I stall, follow up with one example and one nudge question.`
      },
      {
        label: "Idea sketch",
        msg:
`Help me make a quick idea sketch. 
Provide: 
1) Title 
2) Who it helps 
3) Why it matters 
4) How it works (three bullets) 
5) The first step I could take. 
Then ask if I’d like to tweak it or lock it in. 
If domain or audience is missing, follow up with me.`
      },
      {
        label: "Reframe it",
        msg:
`Let’s do a cognitive reframe. 
First, ask me to share one stressful thought. 
Next, ask for evidence supporting it and evidence against it. 
Then give me one balanced replacement thought in plain language. 
If my thought is too broad, follow up with one clarifying question.`
      },
      {
        label: "Tiny habit",
        msg:
`Suggest a tiny habit I can do in under two minutes. 
Present it as cue → action → reward. 
Offer me two options (A and B) and ask me to pick one. 
If context like morning/evening or home/work matters, follow up with me first.`
      },
      {
        label: "Mood check",
        msg:
`I’d like a quick mood check. 
Ask me to rate my mood from 1–10 and my energy from 1–10. 
Then suggest one regulation tool I can use today and one small win I could aim for. 
If the scores point to different strategies, follow up with me to confirm preference (calming vs. energizing).`
      },
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

  const triggerPrompt = (msg: string) => {
    startChatWithMessage(msg);
  };

  const bottomSpacerPx = 180;

  return (
    <div className="flex flex-col h-full w-full max-w-sm sm:max-w-2xl lg:max-w-4xl mx-auto relative pb-1">
      {/* styles omitted for brevity (same as before: pills, glow, header, greet) */}
      {/* Header gradient + header content */}
      {/* Messages container */}
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
                <h3 className="text-base sm:text-lg font-semibold text-foreground mb-2">
                  Welcome to ArcAI
                </h3>
                <div className="mx-auto max-w-3xl">
                  <div className="flex flex-wrap items-center justify-center gap-4 py-4">
                    {quickPrompts.map((p, idx) => (
                      <button
                        key={idx}
                        className="pill"
                        onClick={() => triggerPrompt(p.msg)}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
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