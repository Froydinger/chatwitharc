import { useState, useRef, useEffect } from "react";
import { Send, Plus, Settings, History } from "lucide-react";
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const { toast } = useToast();
  const { profile } = useAuth();

  // Quick Prompts for mobile
  const quickPrompts = [
    {
      label: "💭 Wellness Check",
      prompt: "Help me do a quick wellness check. Ask me about my mood and energy level, then give me personalized advice."
    },
    {
      label: "🎨 Creative Spark",
      prompt: "I need creative inspiration. Give me an interesting creative idea I can work on today."
    },
    {
      label: "🔥 Focus Sprint",
      prompt: "Help me set up a focused work session. Guide me through planning a productive 25-minute sprint."
    },
    {
      label: "🙏 Gratitude Practice",
      prompt: "Lead me through a quick gratitude exercise to help me appreciate the good things in my life."
    },
    {
      label: "💬 Just Chat",
      prompt: "I want to have a casual conversation. Ask me about my day and let's chat like friends."
    },
    {
      label: "🎯 Quick Advice",
      prompt: "I have a situation I need advice on. Help me think through a decision or challenge I'm facing."
    }
  ];

  // Smooth scroll on new content
  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [messages, isLoading]);

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

  // Show panels
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

  // Main chat interface
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
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

      {/* Messages Area */}
      <div className="flex-1 flex flex-col">
        <div 
          className={`flex-1 overflow-hidden ${dragOver ? "bg-primary/5" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <div ref={messagesContainerRef} className="h-full overflow-y-auto">
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
                      Welcome to ArcAI
                    </h2>
                    <p className="text-muted-foreground text-sm max-w-sm">
                      Your intelligent AI assistant. Choose a quick prompt below or start typing to begin.
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
                          {isGeneratingImage ? 'Generating image...' : 'AI is thinking...'}
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
                          {isGeneratingImage ? 'Generating image...' : 'AI is thinking...'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Scroll anchor */}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Chat Input */}
        <div className="border-t border-border/20 p-4 bg-background/80 backdrop-blur-sm">
          <ChatInput />
        </div>
      </div>
    </div>
  );
}