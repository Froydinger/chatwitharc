import { Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { ThemedLogo } from "@/components/ThemedLogo";

interface ImageGenerationPlaceholderProps {
  prompt: string;
  onComplete?: () => void;
}

export function ImageGenerationPlaceholder({ prompt, onComplete }: ImageGenerationPlaceholderProps) {
  return (
    <motion.div
      className="w-full bg-muted/30 backdrop-blur-sm rounded-xl border border-border/40 overflow-hidden flex items-center justify-center"
      style={{ aspectRatio: '16 / 9' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex flex-col items-center gap-4">
        <div className="relative flex items-center justify-center" style={{ willChange: 'transform' }}>
          <motion.div
            className="h-20 w-20"
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
            <ThemedLogo className="h-full w-full" alt="Generating" />
          </motion.div>
          <motion.div
            className="absolute inset-0 rounded-full bg-primary/30"
            style={{
              filter: 'blur(24px)',
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
            className="absolute -top-2 -right-2"
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
            <Sparkles className="h-5 w-5 text-primary" />
          </motion.div>
        </div>
        <motion.span
          className="text-lg font-medium text-foreground/80"
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          Generating image...
        </motion.span>
      </div>
    </motion.div>
  );
}