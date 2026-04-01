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
      className="w-full max-w-sm mx-auto bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden flex items-center justify-center"
      style={{ aspectRatio: '1 / 1', minHeight: '320px' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex flex-col items-center gap-6 p-8">
        <div className="relative flex items-center justify-center" style={{ willChange: 'transform' }}>
          <motion.div
            className="h-24 w-24"
            style={{
              backfaceVisibility: 'hidden',
              transform: 'translateZ(0)',
              willChange: 'transform'
            }}
            initial={{ opacity: 0 }}
            animate={{
              opacity: 1,
              scale: [1, 1.1, 1]
            }}
            transition={{
              opacity: { duration: 0.4, ease: "easeOut" },
              scale: { duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.4 }
            }}
          >
            <ThemedLogo className="h-full w-full opacity-90" alt="Generating" />
          </motion.div>
          <motion.div
            className="absolute inset-0 rounded-full bg-primary/20"
            style={{
              filter: 'blur(32px)',
              backfaceVisibility: 'hidden',
              transform: 'translateZ(0)',
              willChange: 'transform, opacity'
            }}
            initial={{ opacity: 0 }}
            animate={{
              scale: [0.8, 1.3, 0.8],
              opacity: [0.2, 0.5, 0.2]
            }}
            transition={{
              opacity: { duration: 0.4, ease: "easeOut" },
              scale: { duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.4 }
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
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          >
            <Sparkles className="h-6 w-6 text-primary/80" />
          </motion.div>
        </div>
        <div className="flex flex-col items-center gap-2 text-center">
          <motion.span
            className="text-xl font-semibold text-foreground/90 tracking-tight"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            Creating your image
          </motion.span>
          <motion.p
            className="text-sm text-muted-foreground/60 max-w-[200px] line-clamp-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.4 }}
          >
            {prompt}
          </motion.p>
        </div>
      </div>
    </motion.div>
  );
}
