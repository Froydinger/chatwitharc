import { useState, useEffect } from "react";
import { ThinkingIndicator } from "./ThinkingIndicator";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, Image, PenTool, Code2 } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

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

export function WelcomeSection({
  greeting,
  heroAvatar,
  quickPrompts,
  onTriggerPrompt,
  isLoading = false,
  isGeneratingImage = false,
}: WelcomeSectionProps) {
  const [activeTab, setActiveTab] = useState<"chat" | "create" | "write" | "code">("chat");
  const [glowIndex, setGlowIndex] = useState<number>(0);
  const isMobile = useIsMobile();

  // Separate prompts: 6 chat, 6 create, 6 write, 6 code
  const chatPrompts = quickPrompts.slice(0, 6);
  const createPrompts = quickPrompts.slice(6, 12);
  const writePrompts = quickPrompts.slice(12, 18);
  const codePrompts = quickPrompts.slice(18, 24);
  const currentPrompts = 
    activeTab === "chat" ? chatPrompts : 
    activeTab === "create" ? createPrompts : 
    activeTab === "code" ? codePrompts :
    writePrompts;

  // Random glow movement effect
  useEffect(() => {
    const interval = setInterval(
      () => {
        setGlowIndex(Math.floor(Math.random() * currentPrompts.length));
      },
      2000 + Math.random() * 2000,
    );
    return () => clearInterval(interval);
  }, [currentPrompts.length]);

  return (
    <div className="h-full flex flex-col items-center justify-start p-6 pt-8">
      {/* Hero Section */}
      <div className="text-center mb-8 relative">
        {/* Logo positioned above greeting */}
        <motion.div
          animate={{ 
            scale: [1, 1.05, 1]
          }}
          transition={{ 
            duration: 10, 
            repeat: Infinity, 
            ease: "easeInOut" 
          }}
          className="flex justify-center mb-6 opacity-80 mt-[25px]"
        >
          <img 
            src={heroAvatar} 
            alt="ArcAI" 
            className="h-20 w-20" 
          />
        </motion.div>
        
        <h1 className="text-3xl font-bold text-foreground mb-2">{greeting}!</h1>

        <p className="text-muted-foreground text-lg mb-2">What are we getting into to today?</p>
        <p className="text-xs text-muted-foreground/60 px-[27px] font-extralight">
          You can change which model Arc uses in settings. Images are generated w/ Nano Banana 🍌
        </p>
      </div>

      {/* Tab Selection */}
      <div className="flex bg-muted/50 p-1 rounded-lg mb-8 backdrop-blur-sm">
        <motion.button
          onClick={() => setActiveTab("chat")}
          layout
          className={`flex items-center justify-center gap-2 px-3 py-2 rounded-md transition-all duration-300 text-sm ${
            activeTab === "chat"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <MessageCircle size={16} />
          <AnimatePresence mode="wait">
            {activeTab === "chat" && (
              <motion.span
                key="chat-text"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="overflow-hidden whitespace-nowrap"
              >
                Chat
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
        <motion.button
          onClick={() => setActiveTab("create")}
          layout
          className={`flex items-center justify-center gap-2 px-3 py-2 rounded-md transition-all duration-300 text-sm ${
            activeTab === "create"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Image size={16} />
          <AnimatePresence mode="wait">
            {activeTab === "create" && (
              <motion.span
                key="create-text"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="overflow-hidden whitespace-nowrap"
              >
                Create
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
        <motion.button
          onClick={() => setActiveTab("write")}
          layout
          className={`flex items-center justify-center gap-2 px-3 py-2 rounded-md transition-all duration-300 text-sm ${
            activeTab === "write"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <PenTool size={16} />
          <AnimatePresence mode="wait">
            {activeTab === "write" && (
              <motion.span
                key="write-text"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="overflow-hidden whitespace-nowrap"
              >
                Write
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
        <motion.button
          onClick={() => setActiveTab("code")}
          layout
          className={`flex items-center justify-center gap-2 px-3 py-2 rounded-md transition-all duration-300 text-sm ${
            activeTab === "code"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Code2 size={16} />
          <AnimatePresence mode="wait">
            {activeTab === "code" && (
              <motion.span
                key="code-text"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="overflow-hidden whitespace-nowrap"
              >
                Code
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>

      {/* Prompts Grid */}
      <div className="w-full max-w-4xl mb-8 flex-1 pb-32">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            {currentPrompts.map((prompt, index) => {
              const label = prompt.label.replace(/^[^\s]+\s+/, "");
              const isGlowing = index === glowIndex;

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

                  <div className="relative z-10">
                    <h3 className="font-medium text-foreground mb-2 transition-colors duration-200">{label}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-2">{prompt.prompt}</p>
                  </div>
                </motion.button>
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
