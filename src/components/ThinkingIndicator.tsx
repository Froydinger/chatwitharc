import { useState, useEffect } from "react";
import { Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ThemedLogo } from "@/components/ThemedLogo";

interface ThinkingIndicatorProps {
  isLoading: boolean;
  isGeneratingImage: boolean;
  accessingMemory?: boolean;
  searchingChats?: boolean;
}

const ARC_PUNS = [
  "Arc is thinking...",
  "Arc is arcing around...",
  "Just arcing it...",
  "Arcing through ideas...",
  "Following the arc...",
  "Arc-ing up a response...",
  "Making an arc-gument...",
  "Arc-hitecting a reply...",
  "Arc-ticulating thoughts...",
  "Arc and rolling...",
];

export function ThinkingIndicator({ isLoading, isGeneratingImage, accessingMemory, searchingChats }: ThinkingIndicatorProps) {
  const showThinking = isLoading || isGeneratingImage || accessingMemory || searchingChats;
  const [currentPunIndex, setCurrentPunIndex] = useState(0);

  // Rotate through puns every 2 seconds when thinking
  useEffect(() => {
    if (!showThinking || isGeneratingImage || searchingChats || accessingMemory) return;

    const interval = setInterval(() => {
      setCurrentPunIndex((prev) => (prev + 1) % ARC_PUNS.length);
    }, 2000);

    return () => clearInterval(interval);
  }, [showThinking, isGeneratingImage, searchingChats, accessingMemory]);

  // Reset to first pun when thinking starts
  useEffect(() => {
    if (showThinking && isLoading && !isGeneratingImage && !searchingChats && !accessingMemory) {
      setCurrentPunIndex(0);
    }
  }, [showThinking, isLoading, isGeneratingImage, searchingChats, accessingMemory]);

  if (!showThinking) return null;

  const getMessage = () => {
    if (isGeneratingImage) return "Generating image...";
    if (searchingChats) return "Searching past chats...";
    if (accessingMemory) return "Accessing memories...";
    return ARC_PUNS[currentPunIndex];
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
        <div className="relative flex items-center justify-center" style={{ willChange: 'transform' }}>
          <motion.div
            className="h-10 w-10"
            style={{
              backfaceVisibility: 'hidden',
              transform: 'translateZ(0)',
              willChange: 'transform'
            }}
            initial={{ opacity: 0 }}
            animate={{
              opacity: 1,
              scale: [1, 1.15, 1]
            }}
            transition={{
              opacity: { duration: 0.4, ease: "easeOut" },
              scale: { duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: 0.4 }
            }}
          >
            <ThemedLogo className="h-full w-full" alt="Thinking" />
          </motion.div>
          <motion.div
            className="absolute inset-0 rounded-full bg-primary/30"
            style={{
              filter: 'blur(16px)',
              backfaceVisibility: 'hidden',
              transform: 'translateZ(0)',
              willChange: 'transform, opacity'
            }}
            initial={{ opacity: 0 }}
            animate={{
              scale: [0.8, 1.2, 0.8],
              opacity: [0.3, 0.6, 0.3]
            }}
            transition={{
              opacity: { duration: 0.4, ease: "easeOut" },
              scale: { duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: 0.4 }
            }}
          />
          <motion.div
            className="absolute -top-1 -right-1"
            style={{ 
              backfaceVisibility: 'hidden',
              transform: 'translateZ(0)',
              willChange: 'transform, opacity'
            }}
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
        <div className="relative flex items-center min-w-0">
          <AnimatePresence mode="wait">
            <motion.span
              key={getMessage()}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.3 }}
              className="text-sm font-medium text-foreground/80 whitespace-nowrap"
            >
              {getMessage()}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}