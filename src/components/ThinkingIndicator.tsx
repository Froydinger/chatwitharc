import { Sparkles } from "lucide-react";
import { motion } from "framer-motion";

interface ThinkingIndicatorProps {
  isLoading: boolean;
  isGeneratingImage: boolean;
  accessingMemory?: boolean;
  searchingChats?: boolean;
}

export function ThinkingIndicator({ isLoading, isGeneratingImage, accessingMemory, searchingChats }: ThinkingIndicatorProps) {
  const showThinking = isLoading || isGeneratingImage || accessingMemory || searchingChats;
  
  if (!showThinking) return null;

  const getMessage = () => {
    if (isGeneratingImage) return "Generating image...";
    if (accessingMemory) return "Accessing memories...";
    if (searchingChats) return "Searching past chats...";
    return "Arc is thinking...";
  };
  
  return (
    <motion.div 
      className="flex justify-start"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.2 }}
    >
      <div 
        className="inline-flex items-center gap-2.5 px-5 py-3 rounded-2xl bg-muted/50 border border-border/40 backdrop-blur-sm"
        aria-live="polite"
      >
        <div className="relative flex items-center justify-center">
          <motion.img 
            src="/arc-logo-ui.png" 
            alt="Thinking" 
            className="h-10 w-10"
            animate={{ 
              scale: [1, 1.15, 1]
            }}
            transition={{ 
              duration: 1.5,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
          <motion.div
            className="absolute inset-0 rounded-full bg-primary/30 blur-xl"
            animate={{ 
              scale: [0.8, 1.2, 0.8],
              opacity: [0.3, 0.6, 0.3]
            }}
            transition={{ 
              duration: 1.5,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
          <motion.div
            className="absolute -top-1 -right-1"
            animate={{ 
              scale: [0, 1, 0],
              opacity: [0, 1, 0]
            }}
            transition={{ 
              duration: 1.5,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          >
            <Sparkles className="h-3 w-3 text-primary" />
          </motion.div>
        </div>
        <span className="text-sm font-medium text-foreground/80">
          {getMessage()}
        </span>
      </div>
    </motion.div>
  );
}