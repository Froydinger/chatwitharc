import { useState } from "react";
import { ThinkingIndicator } from "./ThinkingIndicator";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, Image } from "lucide-react";

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

// Define which prompts are image-focused
const IMAGE_EMOJI_SET = new Set(["🎨", "🔮", "🎪", "🎬", "🎵"]);

const separatePrompts = (prompts: Array<{ label: string; prompt: string }>) => {
  const chatPrompts = prompts.filter((p) => !IMAGE_EMOJI_SET.has(p.label.charAt(0)));
  const imagePrompts = prompts.filter((p) => IMAGE_EMOJI_SET.has(p.label.charAt(0)));
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
  const [activeTab, setActiveTab] = useState<"chat" | "image">("chat");
  const { chatPrompts, imagePrompts } = separatePrompts(quickPrompts);

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
          className={`flex items-center gap-2 px-6 py-2 rounded-md transition-all duration-200 ${
            activeTab === "chat"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <MessageCircle size={16} />
          Chat
        </button>
        <button
          onClick={() => setActiveTab("image")}
          className={`flex items-center gap-2 px-6 py-2 rounded-md transition-all duration-200 ${
            activeTab === "image"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Image size={16} />
          Images
        </button>
      </div>

      {/* Prompts Grid */}
      <div className="w-full max-w-4xl mb-8 flex-1 relative">
        {/* Dancing glow effect */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(500px 300px at var(--glow-x, 50%) var(--glow-y, 50%), rgba(0, 205, 255, 0.15) 0%, transparent 80%)",
          }}
          animate={
            {
              "--glow-x": ["10%", "90%", "10%"],
              "--glow-y": ["10%", "90%", "10%"],
            } as any
          }
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-8 relative z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            {(activeTab === "chat" ? chatPrompts : imagePrompts).map((prompt, index) => {
              const emoji = prompt.label.charAt(0);
              const label = prompt.label.slice(2);

              return (
                <button
                  key={`${activeTab}-${index}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onTriggerPrompt(prompt.prompt);
                  }}
                  className="group p-4 rounded-xl bg-card/50 backdrop-blur-sm transition-all duration-200 text-left hover:shadow-lg hover:scale-[1.02] hover:-translate-y-1 cursor-pointer touch-manipulation"
                  style={{
                    border: "1px solid rgba(0, 205, 255, 0.2)",
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 text-2xl">{emoji}</div>
                    <div>
                      <h3 className="font-medium text-foreground mb-1 transition-colors duration-200">{label}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2">{prompt.prompt}</p>
                    </div>
                  </div>
                </button>
              );
            })}
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
