import { useState, useEffect } from "react";
import { ThinkingIndicator } from "./ThinkingIndicator";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle,
  Image,
  PenTool,
  Heart,
  Sparkles,
  Target,
  MessageSquare,
  HandHeart,
  Gift,
  Palette,
  Galaxy,
  Film,
  Leaf,
  PartyPopper,
  Stars,
  BookOpen,
  FileText,
  Mail,
  Clapperboard,
  FileEdit,
  Feather,
} from "lucide-react";

interface WelcomeSectionProps {
  greeting: string;
  heroAvatar: string;
  quickPrompts: Array<{
    label: string;
    prompt: string;
  }>;
  onTriggerPrompt: (prompt: string) => void;
  isLoading?: boolean;
  isGeneratingImage?: boolean;
}

// These are the IMAGE prompts - they have these specific emojis
const IMAGE_PROMPTS = new Set([
  "🎨 Dream Poster",
  "🎪 Fever Dream",
  "🎬 Cult Classic",
  "🎵 Mixtape Maker",
  "🔮 Future Forecast",
]);

const separatePrompts = (prompts: Array<{ label: string; prompt: string }>) => {
  const chatPrompts = prompts.filter((p) => !IMAGE_PROMPTS.has(p.label));
  const imagePrompts = prompts.filter((p) => IMAGE_PROMPTS.has(p.label));
  return { chatPrompts, imagePrompts };
};

export function WelcomeSection({
  greeting,
  heroAvatar,
  quickPrompts,
  onTriggerPrompt,
  isLoading = false,
  isGeneratingImage = false,
}: WelcomeSectionProps) {
  const [activeTab, setActiveTab] = useState<"chat" | "create" | "write">("chat");
  const [glowIndex, setGlowIndex] = useState<number>(0);

  // Separate prompts: 6 chat, 6 create, 6 write
  const chatPrompts = quickPrompts.slice(0, 6);
  const createPrompts = quickPrompts.slice(6, 12);
  const writePrompts = quickPrompts.slice(12, 18);
  const currentPrompts = activeTab === "chat" ? chatPrompts : activeTab === "create" ? createPrompts : writePrompts;

  // Random glow movement effect
  useEffect(() => {
    const interval = setInterval(
      () => {
        setGlowIndex(Math.floor(Math.random() * currentPrompts.length));
      },
      2000 + Math.random() * 2000,
    ); // 2-4 seconds between changes
    return () => clearInterval(interval);
  }, [currentPrompts.length]);

  return (
    <div className="h-full flex flex-col items-center justify-start p-6 pt-8">
      {/* Hero Section */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">{greeting}!</h1>

        <p className="text-muted-foreground text-lg mb-2">What are we getting into to today?</p>
        <p className="text-xs text-muted-foreground/60 px-[27px] font-extralight">
          Tap a prompt below to edit it and send it! You can change which model Arc uses in settings. Images are
          generated w/ Nano Banana 🍌
        </p>
      </div>

      {/* Tab Selection */}
      <div className="flex bg-muted/50 p-1 rounded-lg mb-8 backdrop-blur-sm">
        <button
          onClick={() => setActiveTab("chat")}
          className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all duration-200 text-sm ${
            activeTab === "chat"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <MessageCircle size={14} />
          Chat
        </button>
        <button
          onClick={() => setActiveTab("create")}
          className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all duration-200 text-sm ${
            activeTab === "create"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Image size={14} />
          Create
        </button>
        <button
          onClick={() => setActiveTab("write")}
          className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all duration-200 text-sm ${
            activeTab === "write"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <PenTool size={14} />
          Write
        </button>
      </div>

      {/* Prompts Grid */}
      <div className="w-full max-w-4xl mb-8 flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            {(activeTab === "chat" ? chatPrompts : activeTab === "create" ? createPrompts : writePrompts).map(
              (prompt, index) => {
                const label = prompt.label.replace(/^[^\s]+\s+/, ""); // Remove emoji
                const isGlowing = index === glowIndex;
                const Icon = getIconForPrompt(prompt.label);

                return (
                  <motion.button
                    key={`${activeTab}-${index}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onTriggerPrompt(prompt.prompt);
                    }}
                    className="group p-4 rounded-xl bg-card/50 backdrop-blur-sm transition-all duration-200 text-left hover:shadow-lg hover:scale-[1.02] hover:-translate-y-1 cursor-pointer touch-manipulation relative"
                    style={{
                      border: "1px solid rgba(0, 205, 255, 0.2)",
                    }}
                    whileHover={{ boxShadow: "0 0 20px rgba(0, 205, 255, 0.4)" }}
                  >
                    {/* Glow only on active tile */}
                    <motion.div
                      className="absolute inset-0 rounded-xl pointer-events-none"
                      style={{
                        boxShadow: "0 0 30px rgba(0, 205, 255, 0)",
                        border: "1px solid rgba(0, 205, 255, 0.2)",
                      }}
                      animate={{
                        boxShadow: isGlowing
                          ? [
                              "0 0 10px rgba(0, 205, 255, 0.3)",
                              "0 0 25px rgba(0, 205, 255, 0.6)",
                              "0 0 10px rgba(0, 205, 255, 0.3)",
                            ]
                          : "0 0 30px rgba(0, 205, 255, 0)",
                      }}
                      transition={{
                        duration: isGlowing ? 1.5 : 0.3,
                        repeat: isGlowing ? Infinity : 0,
                        ease: "easeInOut",
                      }}
                    />

                    <div className="flex items-start gap-3 relative z-10">
                      <div className="flex-shrink-0 text-[#00cdff]">
                        <Icon size={20} />
                      </div>
                      <div>
                        <h3 className="font-medium text-foreground mb-2 transition-colors duration-200">{label}</h3>
                        <p className="text-sm text-muted-foreground line-clamp-2">{prompt.prompt}</p>
                      </div>
                    </div>
                  </motion.button>
                );
              },
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Thinking Indicator */}
      <div>
        <ThinkingIndicator isLoading={isLoading} isGeneratingImage={isGeneratingImage} />
      </div>
    </div>
  );
}
