import { useState, useRef, useEffect, useMemo } from "react";
import { useArcStore } from "@/store/useArcStore";
import { MessageBubble } from "@/components/MessageBubble";
import { ChatInput } from "@/components/ChatInput";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

export function ChatInterface() {
  const { 
    messages, 
    isLoading, 
    isGeneratingImage,
    startChatWithMessage 
  } = useArcStore();

  const [dragOver, setDragOver] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const { toast } = useToast();
  const { profile } = useAuth();

  // Quick Prompts - cleaned up for direct sending
  const quickPrompts = useMemo(
    () => [
      {
        label: "Wellness check",
        ctx: "Run a structured wellness check with sequential turns. Step 1) Ask me to rate my mood from 1–10 and wait. Step 2) Ask me for ONE word that describes how I feel and wait. Step 3) Ask what I think contributed to that mood and wait. Step 4) Suggest exactly TWO right-now regulation options (brief, actionable); invite me to pick one. Tone: warm, concise, non-judgmental."
      },
      {
        label: "Companion chat",
        ctx: "Act as a supportive companion. Open with ONE validating sentence (no clichés), then ask ONE open question about my day. Keep replies ≤3 sentences unless I ask for more. Mirror my emotion in one short phrase each turn."
      },
      {
        label: "Creative spark",
        ctx: "Brainstorm exactly ONE creative idea. Return format: • Title • Three crisp bullets (what it is, who it's for, how it's novel) • One next step I can take today. Then ask if I want a second variant."
      },
      {
        label: "Quick vent",
        ctx: "Provide a space to vent. Let me type freely; when I indicate I'm done, do: • Acknowledge in one sentence • Summarize in one sentence • Ask ONE short follow-up question. Do NOT give advice unless I ask."
      },
      {
        label: "Focus sprint",
        ctx: "Guide a 15-minute focus sprint. 1) Help me define a single finish line in one sentence; wait. 2) Post a lightweight timer message. 3) Provide a 3-step plan. 4) Ask me to confirm start."
      },
      {
        label: "Gratitude ×3",
        ctx: "Run a three-item gratitude exercise, one at a time. After each item, reflect the theme back in ONE warm sentence. Keep tone brief and encouraging."
      },
    ],
    []
  );

  // Smooth scroll on new content
  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [messages, isLoading]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  // Send prompt directly as user message
  const triggerPrompt = (prompt: string) => {
    startChatWithMessage(prompt);
  };

  return (
    <div className="flex flex-col h-full w-full max-w-4xl mx-auto relative">
      {/* Messages Container */}
      <div 
        className={`flex-1 card overflow-hidden ${dragOver ? "border-primary ring-2 ring-primary/20" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <div ref={messagesContainerRef} className="h-full overflow-y-auto scroll-smooth relative">
          <div className="px-6 py-6 w-full max-w-full">
            {/* Empty state with welcome */}
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
                <div className="mb-8 animate-scale-in">
                  <img
                    src="/lovable-uploads/72a60af7-4760-4f2e-9000-1ca90800ae61.png"
                    alt="ArcAI"
                    className="h-24 w-24 mx-auto mb-6"
                  />
                  <h2 className="text-3xl font-bold text-foreground mb-2">
                    Welcome to ArcAI
                  </h2>
                  <p className="text-lg text-muted-foreground mb-8 max-w-md">
                    Your intelligent AI assistant. Start a conversation or choose a quick prompt below.
                  </p>
                </div>

                {/* Quick Prompts Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
                  {quickPrompts.map((prompt, idx) => (
                    <button
                      key={idx}
                      onClick={() => triggerPrompt(prompt.ctx)}
                      className="p-6 card hover:scale-105 transition-all duration-200 text-left group animate-fade-in-up"
                      style={{ animationDelay: `${idx * 50}ms` }}
                    >
                      <h3 className="font-semibold text-foreground mb-2 group-hover:text-primary transition-colors">
                        {prompt.label}
                      </h3>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {prompt.ctx.split('\n')[0]}
                      </p>
                    </button>
                  ))}
                </div>

                {(isLoading || isGeneratingImage) && (
                  <div className="mt-8 flex justify-center">
                    <div className="surface px-6 py-4 rounded-xl animate-scale-in">
                      <div className="flex items-center gap-3">
                        <div className="flex gap-1">
                          {[0, 1, 2].map((i) => (
                            <div key={i} className="w-3 h-3 bg-primary rounded-full animate-pulse" />
                          ))}
                        </div>
                        <span className="text-muted-foreground">
                          {isGeneratingImage ? 'Generating your image...' : 'AI is thinking...'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Messages */}
                <div className="space-y-6">
                  {messages.map((message) => (
                    <MessageBubble key={message.id} message={message} onEdit={() => {}} />
                  ))}
                </div>

                {/* Thinking indicator */}
                {(isLoading || isGeneratingImage) && (
                  <div className="flex justify-center mt-6">
                    <div className="surface px-6 py-4 rounded-xl animate-scale-in">
                      <div className="flex items-center gap-3">
                        <div className="flex gap-1">
                          {[0, 1, 2].map((i) => (
                            <div key={i} className="w-3 h-3 bg-primary rounded-full animate-pulse" />
                          ))}
                        </div>
                        <span className="text-muted-foreground">
                          {isGeneratingImage ? 'Generating your image...' : 'AI is thinking...'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Scroll anchor */}
            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>

      {/* Chat Input - Integrated directly */}
      <div className="border-t border-border/20 p-6 bg-background/50 backdrop-blur-sm">
        <ChatInput />
      </div>
    </div>
  );
}