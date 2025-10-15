import { useState, useRef, useEffect } from "react";
import { Plus, Menu, Sun, Moon } from "lucide-react";
import { motion } from "framer-motion";
import { useArcStore } from "@/store/useArcStore";
import { MessageBubble } from "@/components/MessageBubble";
import { ChatInput } from "@/components/ChatInput";
import { RightPanel } from "@/components/RightPanel";
import { WelcomeSection } from "@/components/WelcomeSection";
import { ThinkingIndicator } from "@/components/ThinkingIndicator";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useProfile } from "@/hooks/useProfile";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

/** Time-of-day greeting (no name usage) */
function getDaypartGreeting(d: Date = new Date()): "Good Morning" | "Good Afternoon" | "Good Evening" {
  const h = d.getHours();
  if (h >= 5 && h < 12) return "Good Morning";
  if (h >= 12 && h < 18) return "Good Afternoon";
  return "Good Evening";
}

/** Keep header logo as-is; use the head-only avatar above prompts */
const HERO_AVATAR = "/lovable-uploads/87484cd8-85ad-46c7-af84-5cfe46e7a8f8.png";

export function MobileChatApp() {
  const {
    messages,
    isLoading,
    isGeneratingImage,
    createNewSession,
    startChatWithMessage,
    rightPanelOpen,
    setRightPanelOpen,
    rightPanelTab,
    setRightPanelTab,
  } = useArcStore();
  const { profile } = useProfile();
  const { theme, toggleTheme } = useTheme();
  const [dragOver, setDragOver] = useState(false);
  const [hasSelectedImages, setHasSelectedImages] = useState(false);

  // Scroll container for messages
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Fixed input dock measurement
  const inputDockRef = useRef<HTMLDivElement>(null);
  const [inputHeight, setInputHeight] = useState<number>(96);
  const { toast } = useToast();

  // Greeting
  const getPersonalizedGreeting = () => {
    const timeGreeting = getDaypartGreeting();
    const displayName = profile?.display_name;
    return displayName ? `${timeGreeting}, ${displayName}` : timeGreeting;
  };
  const [greeting, setGreeting] = useState(getPersonalizedGreeting());
  useEffect(() => {
    setGreeting(getPersonalizedGreeting());
    const id = setInterval(() => setGreeting(getPersonalizedGreeting()), 60_000);
    return () => clearInterval(id);
  }, [profile?.display_name]);

  // Quick Prompts
  const quickPrompts = [
    {
      label: "🎯 Focus",
      prompt: "Help me set up a focused work session. Guide me through planning a productive 25-minute sprint.",
    },
    {
      label: "🎨 Create",
      prompt: "I need creative inspiration. Give me an interesting creative idea I can work on today.",
    },
    {
      label: "💭 Check-in",
      prompt:
        "Help me do a quick wellness check. Ask me about my mood and energy level, then give me personalized advice.",
    },
    {
      label: "💬 Chat",
      prompt: "I want to have a casual conversation. Ask me about my day and let's chat like friends.",
    },
    {
      label: "🤝 Advice",
      prompt: "I have a situation I need advice on. Help me think through a decision or challenge I'm facing.",
    },
    {
      label: "🙏 Gratitude",
      prompt: "Lead me through a quick gratitude exercise to help me appreciate the good things in my life.",
    },
    { label: "📚 Learn", prompt: "Help me understand something new. I want to learn about a topic that interests me." },
    {
      label: "📋 Plan",
      prompt: "Help me organize my day or week. Guide me through creating a structured plan for my goals.",
    },
    {
      label: "🪞 Reflect",
      prompt: "Lead me through a guided reflection session about my recent experiences and growth.",
    },
    { label: "⚡ Motivate", prompt: "I need encouragement and motivation. Help me feel inspired and energized." },
    {
      label: "🤔 Decide",
      prompt: "Help me make a decision. I have options to consider and need guidance on choosing the best path.",
    },
    {
      label: "🧘 Calm",
      prompt: "I need stress relief and calming support. Guide me through a relaxation or mindfulness exercise.",
    },
  ];

  // Scroll to bottom when new content arrives
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el || messages.length === 0) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading, isGeneratingImage]);

  // Reset scroll when empty
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    if (messages.length === 0) {
      setTimeout(() => {
        el.scrollTop = 0;
        requestAnimationFrame(() => (el.scrollTop = 0));
      }, 10);
    }
  }, [messages.length]);

  // Measure input dock height
  useEffect(() => {
    const update = () => inputDockRef.current && setInputHeight(inputDockRef.current.offsetHeight);
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
    setRightPanelOpen(false);
    setTimeout(() => {
      const el = messagesContainerRef.current;
      if (el) {
        el.scrollTop = 0;
        requestAnimationFrame(() => (el.scrollTop = 0));
      }
    }, 50);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };
  const triggerPrompt = (prompt: string) => {
    startChatWithMessage(prompt);
    setRightPanelOpen(false);
  };

  // Main render
  return (
    <div className="min-h-screen bg-background flex">
      <div
        className={cn(
          "flex-1 flex flex-col transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
          rightPanelOpen && "lg:mr-80 xl:mr-96",
        )}
      >
        {/* Header */}
        <header className="sticky top-0 z-40 border-b border-border/40 bg-background/95 backdrop-blur pt-2">
          <div className="flex h-16 items-center justify-between px-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <motion.img
                  src={HERO_AVATAR}
                  alt="ArcAI"
                  className="h-8 w-8 rounded-small avatar-filled-eyes"
                  animate={{ y: [0, -2, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.div
                  className="absolute -inset-1 bg-primary/20 rounded-full blur-sm"
                  animate={{ scale: [1, 1.05, 1], opacity: [0.2, 0.4, 0.2] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                />
              </div>
              <h1 className="text-lg">
                <span className="text-[#00cdff] text-lg font-normal">Arc</span>
                <span className="font-semibold">Ai</span>
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="rounded-full" onClick={handleNewChat}>
                <Plus className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="rounded-full"
                onClick={toggleTheme}
                title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="rounded-full"
                onClick={() => setRightPanelOpen(!rightPanelOpen)}
              >
                <Menu className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>

        {/* Messages */}
        <div
          className={`relative flex-1 ${dragOver ? "bg-primary/5" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <div
            ref={messagesContainerRef}
            className="absolute inset-0 overflow-y-auto"
            style={{ paddingBottom: `calc(${inputHeight}px + env(safe-area-inset-bottom, 0px) + 3rem)` }}
          >
            {messages.length === 0 ? (
              <WelcomeSection
                greeting={greeting}
                heroAvatar={HERO_AVATAR}
                quickPrompts={quickPrompts}
                onTriggerPrompt={triggerPrompt}
                isLoading={isLoading}
                isGeneratingImage={isGeneratingImage}
              />
            ) : (
              <div className="p-4 space-y-4 chat-messages">
                {messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    onEdit={(messageId, newContent) => {
                      window.dispatchEvent(
                        new CustomEvent("processEditedMessage", {
                          detail: { content: newContent, editedMessageId: messageId },
                        }),
                      );
                    }}
                  />
                ))}
                {isLoading && !isGeneratingImage && <ThinkingIndicator isLoading />}
              </div>
            )}
          </div>

          {/* Input dock */}
          <div ref={inputDockRef} className="fixed inset-x-0 bottom-6 z-30 pointer-events-none px-4">
            <div className={cn("transition-all duration-300 max-w-4xl mx-auto", rightPanelOpen && "lg:mr-80 xl:mr-96")}>
              <div className="pointer-events-auto glass-dock" data-has-images={hasSelectedImages}>
                <ChatInput onImagesChange={setHasSelectedImages} />
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <RightPanel
          isOpen={rightPanelOpen}
          onClose={() => setRightPanelOpen(false)}
          activeTab={rightPanelTab as any}
          onTabChange={setRightPanelTab}
        />
      </div>
    </div>
  );
}
