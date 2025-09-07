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

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading, isGeneratingImage]);

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

  const triggerAttach = () => {
    fileInputRef.current?.click();
  };

  const handleAttachChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // Try a dedicated store action first, if your Zustand store exposes it
      // @ts-ignore
      const getState = (useArcStore as any)?.getState;
      // @ts-ignore
      const storeNow = typeof getState === "function" ? getState() : null;

      if (storeNow && typeof storeNow.sendImageForAnalysis === "function") {
        await storeNow.sendImageForAnalysis(file);
        toast({ title: "Image attached", description: "Sent for analysis." });
      } else {
        // Fallback: send a blob URL in-chat so you see it
        const url = URL.createObjectURL(file);
        startChatWithMessage(`Analyze this image: ${url}`);
        toast({ title: "Image attached", description: "No analyzer found, sent as message." });
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (err) {
      console.error(err);
      toast({ title: "Attach failed", description: "Could not attach image." });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

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

      {/* Scrollable messages; padded by measured dock height */}
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
                    Welcome to ArcAI
                  </h2>
                  <p className="text-muted-foreground text-sm max-w-sm">
                    Your intelligent AI assistant. Choose a quick prompt below or start typing to begin.
                  </p>
                </div>

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

        {/* Fixed black-glass input dock with paperclip */}
        <div
          ref={inputDockRef}
          className="fixed inset-x-0 bottom-0 z-50 pointer-events-none"
        >
          <div className="px-4 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
            <div className="mx-auto max-w-screen-sm">
              <div className="pointer-events-auto glass-dock black more-transparent">
                {/* Paperclip attach, no background */}
                <button
                  type="button"
                  aria-label="Attach image"
                  className="attach-btn"
                  onClick={triggerAttach}
                >
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

      {/* Scoped styles: more transparent black glass with stronger edge bending */}
      <style>{`
        /* Base black glass pill */
        .glass-dock.black {
          --glass-alpha-1: 0.58;         /* base transparency */
          --glass-alpha-2: 0.48;         /* inner gradient */
          --edge-ring: 12px;             /* thickness of edge refraction ring */
          --specular: 0.22;              /* highlight intensity */
          --shadow: 0.45;                /* drop shadow strength */

          position: relative;
          border-radius: 9999px;
          padding: 10px 12px;
          background:
            radial-gradient(120% 200% at 20% 0%, rgba(0,0,0,var(--glass-alpha-1)), rgba(0,0,0,var(--glass-alpha-2)) 60%, rgba(0,0,0,0.42)),
            linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.00));
          backdrop-filter: blur(10px) saturate(160%) contrast(110%);
          -webkit-backdrop-filter: blur(10px) saturate(160%) contrast(110%);
          border: 0;
          box-shadow:
            0 10px 30px rgba(0,0,0,var(--shadow)),
            inset 0 0.5px 0 rgba(255,255,255,0.10),
            inset 0 -0.5px 0 rgba(255,255,255,0.04);
          overflow: hidden;
        }

        /* More transparent preset */
        .glass-dock.more-transparent {
          --glass-alpha-1: 0.46;
          --glass-alpha-2: 0.38;
          --edge-ring: 14px;
          --specular: 0.28;
          --shadow: 0.38;
        }

        /* Specular sheen and subtle prism tint like the reference */
        .glass-dock.black::before {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background:
            radial-gradient(40% 80% at 18% 8%, rgba(255,255,255,var(--specular)), transparent 60%),
            conic-gradient(from 200deg at 85% 10%,
              rgba(255, 170, 170, 0.10),
              rgba(170, 200, 255, 0.10) 25%,
              rgba(170, 255, 210, 0.08) 50%,
              rgba(255, 210, 170, 0.08) 75%,
              rgba(255, 170, 170, 0.10));
          mix-blend-mode: overlay;
          pointer-events: none;
        }

        /* Edge-bending ring: uses backdrop-filter only at the outer edge to 'refract' the background */
        .glass-dock.black::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;

          /* Amplify what's behind only at the edges to fake lensing */
          backdrop-filter: blur(16px) saturate(180%) brightness(1.08) contrast(1.22);
          -webkit-backdrop-filter: blur(16px) saturate(180%) brightness(1.08) contrast(1.22);

          /* Mask to an edge ring */
          padding: var(--edge-ring);
          -webkit-mask: 
            linear-gradient(#000 0 0) content-box, 
            linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
                  mask-composite: exclude;

          /* Very gentle spectral tint around the rim */
          background:
            conic-gradient(from 0deg,
              rgba(255, 90, 0, 0.10),
              rgba(255, 0, 180, 0.08),
              rgba(0, 140, 255, 0.10),
              rgba(0, 255, 160, 0.08),
              rgba(255, 220, 0, 0.08),
              rgba(255, 90, 0, 0.10));
          mix-blend-mode: screen;
          opacity: 0.35;
          pointer-events: none;
        }

        /* Zero chrome for inputs and buttons in the dock */
        .glass-dock.black input,
        .glass-dock.black textarea,
        .glass-dock.black select {
          background: transparent !important;
          border: 0 !important;
          outline: none !important;
          box-shadow: none !important;
          color: rgba(255,255,255,0.96) !important;
          caret-color: rgba(255,255,255,0.96) !important;
        }
        .glass-dock.black input::placeholder,
        .glass-dock.black textarea::placeholder {
          color: rgba(255,255,255,0.52) !important;
        }
        .glass-dock.black :is(input, textarea, button, select):focus,
        .glass-dock.black :is(input, textarea, button, select):focus-visible {
          outline: none !important;
          box-shadow: none !important;
        }

        /* Buttons, including Send and the paperclip, stay fully transparent */
        .glass-dock.black button,
        .glass-dock.black [role="button"] {
          background: transparent !important;
          border: 0 !important;
          outline: none !important;
          box-shadow: none !important;
        }
        .glass-dock.black svg {
          stroke: rgba(255,255,255,0.92) !important;
        }

        /* Attachment icon placement */
        .attach-btn {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          height: 28px;
          width: 28px;
          padding: 0;
          margin: 0;
          cursor: pointer;
        }
        .attach-btn:hover svg { opacity: 0.85; }
        .attach-btn:active svg { opacity: 0.7; }

        /* Reserve space so input text never sits under the icon */
        .with-attachment-padding { padding-left: 38px; }
      `}</style>
    </div>
  );
}