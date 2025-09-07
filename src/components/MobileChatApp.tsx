import { useState, useRef, useEffect } from "react";
import { Plus, Settings, History } from "lucide-react";
import { useArcStore } from "@/store/useArcStore";
import { MessageBubble } from "@/components/MessageBubble";
import { ChatInput } from "@/components/ChatInput";
import { ChatHistoryPanel } from "@/components/ChatHistoryPanel";
import { SettingsPanel } from "@/components/SettingsPanel";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

export function MobileChatApp() {
  const { 
    messages, 
    isLoading, 
    isGeneratingImage,
    createNewSession,
    startChatWithMessage 
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
  const { profile } = useAuth();

  // Quick Prompts for mobile
  const quickPrompts = [
    { label: "💭 Wellness Check", prompt: "Help me do a quick wellness check. Ask me about my mood and energy level, then give me personalized advice." },
    { label: "🎨 Creative Spark", prompt: "I need creative inspiration. Give me an interesting creative idea I can work on today." },
    { label: "🔥 Focus Sprint", prompt: "Help me set up a focused work session. Guide me through planning a productive 25-minute sprint." },
    { label: "🙏 Gratitude Practice", prompt: "Lead me through a quick gratitude exercise to help me appreciate the good things in my life." },
    { label: "💬 Just Chat", prompt: "I want to have a casual conversation. Ask me about my day and let's chat like friends." },
    { label: "🎯 Quick Advice", prompt: "I have a situation I need advice on. Help me think through a decision or challenge I'm facing." }
  ];

  // Smooth scroll on new content
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading, isGeneratingImage]);

  // Measure input dock height and account for safe area
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

  // History panel
  if (showHistory) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex h-16 items-center justify-between px-4">
            <button
              onClick={() => setShowHistory(false)}
              className="flex items-center gap-3"
            >
              <img
                src="/lovable-uploads/72a60af7-4760-4f2e-9000-1ca90800ae61.png"
                alt="ArcAI"
                className="h-8 w-8"
              />
              <div className="text-left">
                <h1 className="text-lg font-semibold">Chat History</h1>
                <p className="text-xs text-muted-foreground">Your conversations</p>
              </div>
            </button>
            <Button variant="ghost" size="sm" onClick={handleNewChat}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </header>
        <div className="p-4">
          <ChatHistoryPanel />
        </div>
      </div>
    );
  }

  // Settings panel
  if (showSettings) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex h-16 items-center justify-between px-4">
            <button
              onClick={() => setShowSettings(false)}
              className="flex items-center gap-3"
            >
              <img
                src="/lovable-uploads/72a60af7-4760-4f2e-9000-1ca90800ae61.png"
                alt="ArcAI"
                className="h-8 w-8"
              />
              <div className="text-left">
                <h1 className="text-lg font-semibold">Settings</h1>
                <p className="text-xs text-muted-foreground">Customize your experience</p>
              </div>
            </button>
          </div>
        </header>
        <div className="p-4">
          <SettingsPanel />
        </div>
      </div>
    );
  }

  // Main chat interface
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <img
              src="/lovable-uploads/72a60af7-4760-4f2e-9000-1ca90800ae61.png"
              alt="ArcAI"
              className="h-8 w-8"
            />
            <div>
              <h1 className="text-lg font-semibold">ArcAI</h1>
              <p className="text-xs text-muted-foreground">Ask, Reflect, Create.</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowHistory(true)}>
              <History className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowSettings(true)}>
              <Settings className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleNewChat}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Scrollable messages layer. We pad the bottom by the measured input dock height plus safe area. */}
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
            paddingBottom: `calc(${inputHeight}px + env(safe-area-inset-bottom, 0px))`
          }}
        >
          {/* Empty state */}
          {messages.length === 0 ? (
            <div className="flex flex-col h-full">
              {/* Welcome Section */}
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

                {/* Quick Prompts */}
                <div className="w-full max-w-sm space-y-3 mb-6">
                  {quickPrompts.map((prompt, idx) => (
                    <button
                      key={idx}
                      onClick={() => triggerPrompt(prompt.prompt)}
                      className="w-full p-4 card text-left hover:bg-accent/50 transition-colors"
                    >
                      <span className="font-medium text-sm">{prompt.label}</span>
                    </button>
                  ))}
                </div>

                {(isLoading || isGeneratingImage) && (
                  <div className="surface px-4 py-3 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="flex gap-1">
                        {[0, 1, 2].map((i) => (
                          <div key={i} className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                        ))}
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {isGeneratingImage ? "Generating image..." : "AI is thinking..."}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-4">
              {/* Messages */}
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} onEdit={() => {}} />
              ))}

              {/* Thinking indicator */}
              {(isLoading || isGeneratingImage) && (
                <div className="flex justify-center">
                  <div className="surface px-4 py-3 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="flex gap-1">
                        {[0, 1, 2].map((i) => (
                          <div key={i} className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                        ))}
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {isGeneratingImage ? "Generating image..." : "AI is thinking..."}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Fixed glass input dock */}
        <div
          ref={inputDockRef}
          className="fixed inset-x-0 bottom-0 z-50 pointer-events-none"
        >
          <div className="px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
            <div className="mx-auto max-w-screen-sm">
              {/* Outer shadow plate to lift the glass from the background */}
              <div className="pointer-events-auto glass-dock">
                {/* Keep your existing ChatInput. Its fields will be made transparent inside this dock. */}
                <ChatInput />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scoped styles for the glass pill dock */}
      <style>{`
        /* Clear glass pill with warped edge and light bending vibe */
        .glass-dock {
          position: relative;
          border-radius: 9999px;
          padding: 10px 12px;
          background:
            radial-gradient(120% 200% at 20% 0%, rgba(255,255,255,0.18), rgba(255,255,255,0.06) 60%, rgba(255,255,255,0.02)),
            linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.04));
          backdrop-filter: blur(2px) saturate(120%);
          -webkit-backdrop-filter: blur(2px) saturate(120%);
          border: 1px solid rgba(255,255,255,0.28);
          box-shadow:
            0 10px 30px rgba(0,0,0,0.35),
            inset 0 1px 0 rgba(255,255,255,0.35),
            inset 0 -1px 0 rgba(255,255,255,0.10);
          overflow: hidden;
        }
        /* Caustic highlights and edge warp */
        .glass-dock::before {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background:
            radial-gradient(40% 80% at 18% 8%, rgba(255,255,255,0.55), transparent 60%),
            conic-gradient(from 180deg at 82% 0%, rgba(255,255,255,0.40), rgba(255,255,255,0.10) 25%, rgba(255,255,255,0.35) 50%, rgba(255,255,255,0.05) 75%, rgba(255,255,255,0.40));
          mix-blend-mode: overlay;
          opacity: 0.35;
          pointer-events: none;
        }
        /* Inner glow to sell thickness of glass */
        .glass-dock::after {
          content: "";
          position: absolute;
          inset: 1px;
          border-radius: inherit;
          background: linear-gradient(to bottom, rgba(255,255,255,0.16), rgba(255,255,255,0.03));
          mask: radial-gradient(120% 200% at 0% 0%, rgba(0,0,0,0.55), transparent 60%);
          pointer-events: none;
        }
        /* Make inner inputs transparent so the dock glass shows through */
        .glass-dock input,
        .glass-dock textarea,
        .glass-dock .surface,
        .glass-dock .card {
          background-color: transparent !important;
        }
        .glass-dock input,
        .glass-dock textarea {
          border-color: transparent !important;
          box-shadow: none !important;
        }
        /* Keep placeholder and text readable on glass */
        .glass-dock input::placeholder,
        .glass-dock textarea::placeholder {
          color: rgba(255,255,255,0.65);
        }
      `}</style>
    </div>
  );
}