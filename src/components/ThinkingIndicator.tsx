import { Brain, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

interface ThinkingIndicatorProps {
  isLoading: boolean;
  isGeneratingImage: boolean;
}

export function ThinkingIndicator({ isLoading, isGeneratingImage }: ThinkingIndicatorProps) {
  const showThinking = isLoading || isGeneratingImage;
  
  if (!showThinking) return null;
  
  return (
    <motion.div 
      className="flex justify-start"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.2 }}
    >
      <div 
        className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-muted/50 border border-border/40 backdrop-blur-sm"
        aria-live="polite"
      >
        <motion.div 
          className="relative flex items-center justify-center"
          animate={{ 
            scale: [1, 1.1, 1],
            rotate: [0, 5, -5, 0]
          }}
          transition={{ 
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        >
          <Brain className="h-4 w-4 text-primary" />
          <motion.div
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
            <Sparkles className="h-2.5 w-2.5 absolute -top-0.5 -right-0.5 text-primary" />
          </motion.div>
        </motion.div>
        <span className="text-sm font-medium text-foreground/80">
          {isGeneratingImage ? "Generating image..." : "Arc is thinking..."}
        </span>
      </div>
    </motion.div>
  );
}