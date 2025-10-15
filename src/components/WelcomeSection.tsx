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

const getEmojiFromLabel = (label: string): string => {
  return label.split(" ")[0] || "✨";
};

const separatePrompts = (prompts: Array<{ label: string; prompt: string }>) => {
  const chatPrompts = prompts.filter((p) => !p.label.match(/🎨|🎪|🌟|💾|🎬|🎵|🏆|🔮/));
  const imagePrompts = prompts.filter((p) => p.label.match(/🎨|🎪|🌟|💾|🎬|🎵|🏆|🔮/));
  return { chatPrompts, imagePrompts };
};

const getColorForIndex = (index: number): string => {
  const colors = ["emerald", "blue", "purple", "pink", "orange", "teal"];
  return colors[index % colors.length];
};

const getColorClasses = (color: string, isHovered = false) => {
  const colorMap = {
    emerald: isHovered
      ? "bg-emerald-100/20 text-emerald-300 border-emerald-300/30"
      : "bg-emerald-100/10 text-emerald-400 border-emerald-400/20",
    blue: isHovered
      ? "bg-blue-100/20 text-blue-300 border-blue-300/30"
      : "bg-blue-100/10 text-blue-400 border-blue-400/20",
    purple: isHovered
      ? "bg-purple-100/20 text-purple-300 border-purple-300/30"
      : "bg-purple-100/10 text-purple-400 border-purple-400/20",
    pink: isHovered
      ? "bg-pink-100/20 text-pink-300 border-pink-300/30"
      : "bg-pink-100/10 text-pink-400 border-pink-400/20",
    orange: isHovered
      ? "bg-orange-100/20 text-orange-300 border-orange-300/30"
      : "bg-orange-100/10 text-orange-400 border-orange-400/20",
    teal: isHovered
      ? "bg-teal-100/20 text-teal-300 border-teal-300/30"
      : "bg-teal-100/10 text-teal-400 border-teal-400/20",
  };
  return colorMap[color as keyof typeof colorMap] || colorMap.blue;
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
            {(activeTab === "chat" ? chatPrompts : imagePrompts).map((prompt, index) => {
              const color = getColorForIndex(index);
              const emoji = getEmojiFromLabel(prompt.label);

              return (
                <button
                  key={`${activeTab}-${index}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onTriggerPrompt(prompt.prompt);
                  }}
                  className="group p-4 rounded-xl bg-card/50 backdrop-blur-sm transition-all duration-200 text-left hover:shadow-lg hover:scale-[1.02] hover:-translate-y-1 cursor-pointer touch-manipulation border"
                  style={{
                    borderColor: `hsl(var(--${color}-500) / 0.2)`,
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex-shrink-0 p-2 rounded-lg transition-all duration-200 text-lg ${getColorClasses(
                        color,
                      )}`}
                    >
                      {emoji}
                    </div>
                    <div>
                      <h3 className="font-medium text-foreground mb-1 transition-colors duration-200">
                        {prompt.label}
                      </h3>
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
