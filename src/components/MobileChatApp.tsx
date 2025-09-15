import { useState, useRef, useEffect } from "react";
import { Plus, Settings, History } from "lucide-react";
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

  // Listen for chat history close events
  useEffect(() => {
    const handleCloseHistory = () => {
      setShowHistory(false);
    };
    window.addEventListener('arcai:closeHistory', handleCloseHistory);
    return () => window.removeEventListener('arcai:closeHistory', handleCloseHistory);
  }, []);

  // Scroll container for messages
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Fixed input dock measurement
  const inputDockRef = useRef<HTMLDivElement>(null);
  const [inputHeight, setInputHeight] = useState<number>(96);

  const { toast } = useToast();
  const { profile } = useAuth();

  // Quick Prompts for mobile - 12 prompts in 2 columns with emojis
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

  // Robust "scroll to top" helper
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

  // Smooth scroll to bottom on new content
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading, isGeneratingImage]);

  // When chat is empty, go to top
  useEffect(() => {
    if (messages.length === 0) {
      scrollToTop();
      requestAnimationFrame(scrollToTop);
    }
  }, [messages.length]);

  // On session change, go to top
  useEffect(() => {
    if (currentSessionId) {
      scrollToTop();
      requestAnimationFrame(scrollToTop);
    }
  }, [currentSessionId]);

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




  // Main chat interface
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <img
              src="/lovable-uploads/c65f38aa-5928-46e1-b224-9f6a2bacbf18.png"
              alt="ArcAI"
              className="h-8 w-8"
            />
            <div>
              {/* Brand: ArcAi (Arc ultra-thin, Ai semibold) */}
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
          style={{
            paddingBottom: `calc(${inputHeight}px + env(safe-area-inset-bottom, 0px) + 4rem)`
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

                {/* Quick Prompts - 2 Column Grid */}
                <div className="w-full max-w-md grid grid-cols-2 gap-3 mb-12">
                  {quickPrompts.map((prompt, idx) => (
                    <button
                      key={idx}
                      onClick={() => triggerPrompt(prompt.prompt)}
                      className="p-4 card text-center hover:bg-accent/50 transition-colors rounded-full border border-border/40"
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
              {/* ONE black frosted glass pill */}
              <div className="pointer-events-auto glass-dock">
                {/* Keep your ChatInput exactly as is */}
                <ChatInput />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scoped styles for the glass pill dock and small UI patches */}
      <style>{`
        /* ONE full-size black frosted pill */
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

        /* Remove any nested backgrounds/borders/rings/shadows/backdrop effects */
        .glass-dock :is(.surface,.card,[class*="bg-"],[class*="ring-"],[class*="border"],[class*="shadow"],
                        .backdrop-blur,[class*="backdrop-"],[style*="backdrop-filter"]){
          background: transparent !important;
          box-shadow: none !important;
          border: 0 !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
        }

        /* Common wrapper names seen in ChatInput UIs */
        .glass-dock :is(.input-wrapper,.input-container,.chat-input,.field,form){
          background: transparent !important;
          box-shadow: none !important;
          border: 0 !important;
        }

        /* Soft blurry glow on focus within (outside, not clipped) */
        .glass-dock:focus-within{
          box-shadow: 0 10px 30px rgba(0,0,0,0.35), 0 0 16px 4px hsl(var(--primary)/0.3), 0 0 40px 10px hsl(var(--primary)/0.15) !important;
          border-radius: 9999px;
        }

        /* Input defaults: do not alter spacing; only prevent iOS zoom */
        .glass-dock input,
        .glass-dock textarea{
          font-size: 16px !important; /* prevent iOS zoom */
        }

        /* Autofill wash removal (no spacing changes) */
        .glass-dock input:-webkit-autofill,
        .glass-dock textarea:-webkit-autofill{
          -webkit-box-shadow: 0 0 0px 1000px transparent inset !important;
          -webkit-text-fill-color: inherit !important;
          transition: background-color 999999s ease-in-out 0s !important;
        }

        /* Tiny size tweak for any floating "sync" bubble/icon without moving it */
        /* Catch common class/attr patterns so you don't have to rename anything */
        .sync-bubble,
        [data-sync-bubble],
        [data-role="sync-bubble"],
        .sync-indicator,
        [data-sync],
        [class*="sync-bubble"],
        [class*="syncIndicator"],
        [class*="sync-indicator"]{
          transform: scale(0.9) !important;   /* slightly smaller */
          transform-origin: center !important;
        }
        /* If the icon inside is oversized, trim it a hair as well */
        .sync-bubble svg,
        [data-sync-bubble] svg,
        .sync-indicator svg,
        [data-sync] svg{
          width: 0.9em !important;
          height: 0.9em !important;
        }
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