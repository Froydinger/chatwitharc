import { useState, useRef, useEffect } from "react";
import { Plus, Settings, History, Paperclip } from "lucide-react";
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

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputDockRef = useRef<HTMLDivElement>(null);
  const [inputHeight, setInputHeight] = useState<number>(96);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();
  const { profile } = useAuth();

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

  // Measure dock height
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
    toast({ title: "New Chat Started", description: "Ready for a fresh conversation!" });
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

  const triggerAttach = () => fileInputRef.current?.click();

  // Force placeholder text + keep it after rerenders
  useEffect(() => {
    const setPlaceholder = () => {
      if (!inputDockRef.current) return;
      const fields = inputDockRef.current.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        ".glass-content input, .glass-content textarea"
      );
      fields.forEach((f) => {
        try { f.setAttribute("placeholder", "Ask anything"); } catch {}
      });
    };
    setPlaceholder();
    const t = setTimeout(setPlaceholder, 50);
    return () => clearTimeout(t);
  }, [messages]);

  const handleAttachChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = URL.createObjectURL(file);
      startChatWithMessage(`Analyze this image: ${url}`);
      toast({ title: "Image attached", description: "Sent as a message for analysis." });
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      console.error(err);
      toast({ title: "Attach failed", description: "Could not attach image." });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // History
  if (showHistory) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex h-16 items-center justify-between px-4">
            <button onClick={() => setShowHistory(false)} className="flex items-center gap-3">
              <img src="/lovable-uploads/72a60af7-4760-4f2e-9000-1ca90800ae61.png" alt="ArcAI" className="h-8 w-8" />
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

  // Settings
  if (showSettings) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex h-16 items-center justify-between px-4">
            <button onClick={() => setShowSettings(false)} className="flex items-center gap-3">
              <img src="/lovable-uploads/72a60af7-4760-4f2e-9000-1ca90800ae61.png" alt="ArcAI" className="h-8 w-8" />
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

  // Main chat
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <img src="/lovable-uploads/72a60af7-4760-4f2e-9000-1ca90800ae61.png" alt="ArcAI" className="h-8 w-8" />
            <div>
              <h1 className="text-lg font-semibold">ArcAI</h1>
              <p className="text-xs text-muted-foreground">AI Assistant</p>
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

      {/* Messages */}
      <div 
        className={`relative flex-1 ${dragOver ? "bg-primary/5" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <div
          ref={messagesContainerRef}
          className="absolute inset-0 overflow-y-auto"
          style={{ paddingBottom: `calc(${inputHeight}px + env(safe-area-inset-bottom, 0px))` }}
        >
          {messages.length === 0 ? (
            <div className="flex flex-col h-full">
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                <div className="mb-8">
                  <img src="/lovable-uploads/72a60af7-4760-4f2e-9000-1ca90800ae61.png" alt="ArcAI" className="h-20 w-20 mx-auto mb-4" />
                  <h2 className="text-2xl font-bold text-foreground mb-2">Welcome to ArcAI</h2>
                  <p className="text-muted-foreground text-sm max-w-sm">
                    Your intelligent AI assistant. Choose a quick prompt below or start typing to begin.
                  </p>
                </div>
                {/* extra 40px under prompts */}
                <div className="w-full max-w-sm space-y-3 mb-[40px]">
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
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} onEdit={() => {}} />
              ))}
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

        {/* Fixed simplified dock */}
        <div ref={inputDockRef} className="fixed inset-x-0 bottom-0 z-50 pointer-events-none">
          <div className="px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
            <div className="mx-auto max-w-screen-sm">
              <div className="pointer-events-auto glass-dock black simple">
                <div className="glass-content">
                  <button type="button" aria-label="Attach image" className="attach-btn" onClick={triggerAttach}>
                    <Paperclip className="h-5 w-5" />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAttachChange}
                  />
                  <div className="with-attachment-padding">
                    <ChatInput />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Styles: simple black frosted glass, no gradients, no layers */}
      <style>{`
        /* Dock: subtle frosted black pill */
        .glass-dock.black.simple {
          position: relative;
          border-radius: 9999px;
          padding: 10px 12px;
          background: rgba(0,0,0,0.45);            /* slight darkness */
          backdrop-filter: blur(10px) saturate(120%);
          -webkit-backdrop-filter: blur(10px) saturate(120%);
          border: 0;                                 /* no visible border */
          box-shadow: 0 12px 28px rgba(0,0,0,0.4),   /* soft lift */
                      inset 0 1px 0 rgba(255,255,255,0.06),
                      inset 0 -1px 0 rgba(255,255,255,0.03);
          overflow: hidden;
        }

        /* Strip chrome only inside content (inputs/buttons) */
        .glass-dock.black.simple .glass-content * {
          background: transparent !important;
          border: 0 !important;
          outline: none !important;
          box-shadow: none !important;
        }
        .glass-dock.black.simple .glass-content [class*="bg-"],
        .glass-dock.black.simple .glass-content [class*="ring-"],
        .glass-dock.black.simple .glass-content [class*="border"] {
          background-color: transparent !important;
          border: 0 !important;
          box-shadow: none !important;
        }

        /* Inputs readable on dark glass */
        .glass-dock.black.simple .glass-content input,
        .glass-dock.black.simple .glass-content textarea {
          color: rgba(255,255,255,0.96) !important;
          caret-color: rgba(255,255,255,0.96) !important;
        }
        .glass-dock.black.simple .glass-content input::placeholder,
        .glass-dock.black.simple .glass-content textarea::placeholder {
          color: rgba(255,255,255,0.55) !important;
        }
        /* Lower placeholder ~5-6px when visible */
        .glass-dock.black.simple .glass-content input:placeholder-shown,
        .glass-dock.black.simple .glass-content textarea:placeholder-shown {
          padding-top: 6px !important;
        }

        /* Buttons/icons are stroke-only; no hover chips */
        .glass-dock.black.simple .glass-content button,
        .glass-dock.black.simple .glass-content [role="button"] {
          background: transparent !important;
        }
        .glass-dock.black.simple .glass-content svg {
          stroke: rgba(255,255,255,0.94) !important;
          fill: none !important;
        }

        /* Paperclip placement + input padding */
        .attach-btn {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          height: 28px;
          width: 28px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .with-attachment-padding { padding-left: 38px; }
      `}</style>
    </div>
  );
}