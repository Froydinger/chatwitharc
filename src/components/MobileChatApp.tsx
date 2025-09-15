import { useState, useRef, useEffect } from "react";
import { Plus, Settings, History, Brain, Sparkles } from "lucide-react";
import { useArcStore } from "@/store/useArcStore";
import { MessageBubble } from "@/components/MessageBubble";
import { ChatInput } from "@/components/ChatInput";
import { ChatHistoryPanel } from "@/components/ChatHistoryPanel";
import { SettingsPanel } from "@/components/SettingsPanel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

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

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputDockRef = useRef<HTMLDivElement>(null);
  const [inputHeight, setInputHeight] = useState<number>(96);

  const { toast } = useToast();
  const { profile } = useAuth();

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

  const scrollToTop = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    try {
      el.scrollTop = 0;
      window.scrollTo({ top: 0, behavior: "auto" });
      requestAnimationFrame(() => {
        el.scrollTop = 0;
        window.scrollTo({ top: 0, behavior: "auto" });
      });
      setTimeout(() => {
        el.scrollTop = 0;
      }, 50);
    } catch {}
  };

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading, isGeneratingImage]);

  useEffect(() => {
    if (messages.length === 0) {
      scrollToTop();
      requestAnimationFrame(scrollToTop);
    }
  }, [messages.length]);

  useEffect(() => {
    if (currentSessionId) {
      scrollToTop();
      requestAnimationFrame(scrollToTop);
    }
  }, [currentSessionId]);

  useEffect(() => {
    const update = () => {
      if (inputDockRef.current) {
        const h = inputDockRef.current.offsetHeight;
        setInputHeight(h);
      }
    };
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
    setShowHistory(false);
    setShowSettings(false);
    scrollToTop();
    requestAnimationFrame(scrollToTop);
    toast({ 
      title: "New Chat Started", 
      description: "Ready for a fresh conversation!" 
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const triggerPrompt = (prompt: string) => {
    startChatWithMessage(prompt);
    setShowHistory(false);
    setShowSettings(false);
  };

  const ThinkingIndicator = () => (
    <div className="flex justify-center">
      <div className="px-4 py-3 rounded-full relative thinking-glow bg-background/70 backdrop-blur-md border border-border/40">
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
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/95 backdrop-blur">
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <img
              src="/lovable-uploads/c65f38aa-5928-46e1-b224-9f6a2bacbf18.png"
              alt="ArcAI"
              className="h-8 w-8"
            />
            <div>
              <h1 className="text-lg">
                <span className="font-thin">Arc</span><span className="font-semibold">Ai</span>
              </h1>
              <p className="text-xs text-muted-foreground">Ask, Reflect, Create.</p>
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

      <div 
        className={`relative flex-1 ${dragOver ? "bg-primary/5" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <div
          ref={messagesContainerRef}
          className="absolute inset-0 overflow-y-auto"
          style={{
            paddingBottom: `calc(${inputHeight}px + env(safe-area-inset-bottom, 0px) + 4rem)`
          }}
        >
          {messages.length === 0 ? (
            <div className="flex flex-col h-full">
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                <div className="mb-8">
                  <img
                    src="/lovable-uploads/72a60af7-4760-4f2e-9000-1ca90800ae61.png"
                    alt="ArcAI"
                    className="h-20 w-20 mx-auto mb-4"
                  />
                  <h2 className="text-2xl font-bold text-foreground mb-2">
                    Howdy!
                  </h2>
                  <p className="text-muted-foreground text-sm max-w-sm">
                    What can we work on today? Choose a quick prompt below or start typing to begin.
                  </p>
                </div>

                <div className="w-full max-w-md grid grid-cols-2 gap-3 mb-20">
                  {quickPrompts.map((prompt, idx) => (
                    <button
                      key={idx}
                      onClick={() => triggerPrompt(prompt.prompt)}
                      className={`p-4 card text-center hover:bg-accent/50 transition-colors rounded-full border border-border/40 floating-prompt floating-prompt-${idx}`}
                    >
                      <span className="font-medium text-sm">{prompt.label}</span>
                    </button>
                  ))}
                </div>

                {(isLoading || isGeneratingImage) && <ThinkingIndicator />}
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-4">
              {messages.map((message) => (
                <div key={message.id} className="rounded-2xl bg-background/60 backdrop-blur-md border border-border/30 shadow-md p-3">
                  <MessageBubble message={message} onEdit={() => {}} />
                </div>
              ))}

              {(isLoading || isGeneratingImage) && <ThinkingIndicator />}
            </div>
          )}
        </div>

        <div
          ref={inputDockRef}
          className="fixed inset-x-0 bottom-0 z-50 pointer-events-none"
        >
          <div className="px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
            <div className="mx-auto max-w-screen-sm">
              <div className="pointer-events-auto glass-dock">
                <ChatInput />
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .thinking-glow::after{
          content: "";
          position: absolute;
          inset: -12px;
          border-radius: 9999px;
          pointer-events: none;
          background: conic-gradient(from 0deg, 
            rgba(99,102,241,0.25), 
            rgba(16,185,129,0.25), 
            rgba(236,72,153,0.25), 
            rgba(99,102,241,0.25));
          filter: blur(14px);
          animation: spinGlow 6s linear infinite;
        }
        @keyframes spinGlow {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes bounce-slow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-2px); }
        }
        .animate-bounce-slow{ animation: bounce-slow 1.2s ease-in-out infinite; }
        @keyframes twinkle {
          0%, 100% { transform: scale(0.9); opacity: 0.8; }
          50% { transform: scale(1.05); opacity: 1; }
        }
        .animate-twinkle{ animation: twinkle 1.4s ease-in-out infinite; }

        .glass-dock{
          position: relative;
          border-radius: 9999px;
          padding: 10px 12px;
          background: transparent;
          box-shadow: 0 10px 30px rgba(0,0,0,0.35);
          isolation: isolate;
        }
        .glass-dock::before{
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: rgba(0,0,0,0.4);
          backdrop-filter: blur(10px) saturate(120%);
          -webkit-backdrop-filter: blur(10px) saturate(120%);
          z-index: 0;
        }
        .glass-dock > *{ position: relative; z-index: 1; }
      `}</style>
    </div>
  );
}