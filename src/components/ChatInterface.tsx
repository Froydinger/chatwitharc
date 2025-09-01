import { useState, useRef, useEffect } from "react";
import { Image, Plus } from "lucide-react";
import { useArcStore } from "@/store/useArcStore";
import { OpenAIService } from "@/services/openai";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { MessageBubble } from "@/components/MessageBubble";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

export function ChatInterface() {
  const { 
    messages, 
    addMessage, 
    isLoading, 
    setLoading, 
    createNewSession,
    currentSessionId,
    startChatWithMessage 
  } = useArcStore();
  const [dragOver, setDragOver] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { profile } = useAuth();

  // Scroll to show latest user message when new message is added
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === "user") {
        setTimeout(() => {
          if (messagesContainerRef.current) {
            const container = messagesContainerRef.current;
            const scrollHeight = container.scrollHeight;
            const clientHeight = container.clientHeight;
            container.scrollTop = scrollHeight - clientHeight - 60;
          }
        }, 60);
      } else {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
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
    // Handle file drops if needed
  };

  const handleNewChat = () => {
    createNewSession();
    requestAnimationFrame(() => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTo({ top: 0, behavior: "instant" });
        messagesContainerRef.current.scrollTop = 0;
      }
    });
    toast({
      title: "New Chat Started",
      description: "Ready for a fresh conversation!"
    });
  };

  return (
    <div className="flex flex-col h-full w-full max-w-sm sm:max-w-2xl lg:max-w-4xl mx-auto relative pb-1">
      {/* Gradient Header Mask with reduced height */}
      <div className="fixed top-0 left-0 right-0 z-30 h-20 pointer-events-none">
        <div 
          className="w-full h-full"
          style={{
            background: `linear-gradient(to bottom, 
              hsl(var(--background)) 0%, 
              hsl(var(--background) / 0.98) 12%,
              hsl(var(--background) / 0.9) 24%,
              hsl(var(--background) / 0.75) 45%,
              hsl(var(--background) / 0.45) 70%,
              transparent 100%)`,
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            maskImage: `linear-gradient(to bottom, 
              black 0%, 
              rgba(0,0,0,0.7) 50%,
              transparent 100%)`
          }}
        />
      </div>

      {/* Floating Header Content with tighter padding */}
      <div className="fixed top-0 left-0 right-0 z-40 flex justify-center pointer-events-none">
        <div className="w-full max-w-sm sm:max-w-2xl lg:max-w-4xl flex justify-between items-center p-2 pointer-events-auto">
          <img src="/lovable-uploads/10805bee-4d5c-4640-a77f-d2ea5cd05436.png" alt="ArcAI" className="h-7 w-7" />
          <GlassButton
            variant="bubble"
            size="icon"
            onClick={handleNewChat}
            className="h-9 w-9"
          >
            <Plus className="h-4 w-4" />
          </GlassButton>
        </div>
      </div>

      {/* Messages Container with reduced outer padding */}
      <GlassCard 
        variant="bubble" 
        glow
        className={`flex-1 mx-2 mb-2 overflow-hidden ${dragOver ? "border-primary-glow border-2" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <div
          ref={messagesContainerRef}
          className="h-full overflow-y-auto space-y-3 scroll-smooth relative"
          style={{
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
        >
          <style>
            {`
              .h-full.overflow-y-auto::-webkit-scrollbar {
                width: 0px;
                background: transparent;
              }
            `}
          </style>

          <div className="px-3 sm:px-4 pt-16 pb-20 space-y-3 w-full max-w-full">
            <div>
              {messages.length === 0 ? (
                <div className="text-center py-6">
                  <div className="flex justify-center mb-3">
                    <img src="/lovable-uploads/72a60af7-4760-4f2e-9000-1ca90800ae61.png" alt="ArcAI" className="h-12 w-12" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-1">
                    Welcome to ArcAI
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Start a conversation or jump into a task.
                  </p>

                  {/* Quick start cards with tighter spacing */}
                  <div className="grid grid-cols-1 gap-2 max-w-md mx-auto mb-3">
                    <button
                      onClick={() => startChatWithMessage("I'd like a mental wellness check-in. How are you feeling today and what's on your mind?")}
                      className="glass p-3 rounded-xl text-left"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                          <span className="text-green-400 text-base">🧘</span>
                        </div>
                        <div>
                          <h4 className="font-medium text-foreground text-sm">Mental Wellness Check-in</h4>
                          <p className="text-xs text-muted-foreground">Reflect on feelings and thoughts</p>
                        </div>
                      </div>
                    </button>

                    <button
                      onClick={() => startChatWithMessage("I need someone to talk to today. Can you be a supportive companion?")}
                      className="glass p-3 rounded-xl text-left"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                          <span className="text-blue-400 text-base">💙</span>
                        </div>
                        <div>
                          <h4 className="font-medium text-foreground text-sm">Friendly Companion</h4>
                          <p className="text-xs text-muted-foreground">Supportive AI friend</p>
                        </div>
                      </div>
                    </button>

                    <button
                      onClick={() => startChatWithMessage("Let's get creative! Help me brainstorm some ideas or work on a creative project.")}
                      className="glass p-3 rounded-xl text-left"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
                          <span className="text-purple-400 text-base">🎨</span>
                        </div>
                        <div>
                          <h4 className="font-medium text-foreground text-sm">Creative Inspiration</h4>
                          <p className="text-xs text-muted-foreground">Spark ideas fast</p>
                        </div>
                      </div>
                    </button>
                  </div>

                  {/* New compact pill prompts: 7 more, small formation */}
                  <div className="max-w-md mx-auto">
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button
                        onClick={() => startChatWithMessage("I want to vent for 2 minutes. Just listen and reflect back key feelings.")}
                        className="glass rounded-full px-3 py-2 text-xs"
                      >
                        Quick vent
                      </button>
                      <button
                        onClick={() => startChatWithMessage("Guide me through a 15 minute focus sprint with a timer and one goal.")}
                        className="glass rounded-full px-3 py-2 text-xs"
                      >
                        Focus sprint
                      </button>
                      <button
                        onClick={() => startChatWithMessage("Give me three gratitude prompts and wait for my answers one by one.")}
                        className="glass rounded-full px-3 py-2 text-xs"
                      >
                        Gratitude x3
                      </button>
                      <button
                        onClick={() => startChatWithMessage("Help me sketch one idea with a title, 3 bullets, and next step.")}
                        className="glass rounded-full px-3 py-2 text-xs"
                      >
                        Idea sketch
                      </button>
                      <button
                        onClick={() => startChatWithMessage("Help me reframe a stressful thought using CBT style questions.")}
                        className="glass rounded-full px-3 py-2 text-xs"
                      >
                        Reframe it
                      </button>
                      <button
                        onClick={() => startChatWithMessage("Suggest one tiny habit I can do daily in under 2 minutes.")}
                        className="glass rounded-full px-3 py-2 text-xs"
                      >
                        Tiny habit
                      </button>
                      <button
                        onClick={() => startChatWithMessage("Do a quick mood check using 1 to 10, then suggest one regulation tool.")}
                        className="glass rounded-full px-3 py-2 text-xs"
                      >
                        Mood check
                      </button>
                      <button
                        onClick={() => startChatWithMessage("Help me plan a single task for today with a clear finish line.")}
                        className="glass rounded-full px-3 py-2 text-xs"
                      >
                        One task
                      </button>
                      <button
                        onClick={() => startChatWithMessage("Give me a 5 line journaling prompt with a playful tone.")}
                        className="glass rounded-full px-3 py-2 text-xs"
                      >
                        5 line journal
                      </button>
                      <button
                        onClick={() => startChatWithMessage("Guide a 3 minute wind down to prep for better sleep tonight.")}
                        className="glass rounded-full px-3 py-2 text-xs"
                      >
                        Wind down
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message) => (
                    <MessageBubble 
                      key={message.id} 
                      message={message} 
                      onEdit={() => {}} 
                    />
                  ))}
                </div>
              )}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="glass rounded-2xl px-3 py-2 max-w-xs">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        {[0, 1, 2].map((i) => (
                          <div
                            key={i}
                            className="w-2 h-2 bg-primary-glow rounded-full animate-pulse"
                          />
                        ))}
                      </div>
                      <span className="text-xs text-muted-foreground">Thinking...</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Drag overlay */}
        {dragOver && (
          <div
            className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary-glow rounded-[var(--radius)] flex items-center justify-center"
          >
            <div className="text-center">
              <Image className="h-10 w-10 text-primary-glow mx-auto mb-2" />
              <p className="text-primary-foreground font-medium text-sm">Drop images here</p>
            </div>
          </div>
        )}
      </GlassCard>
    </div>
  );
}