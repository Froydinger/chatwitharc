import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

interface ImageGenerationPlaceholderProps {
  prompt: string;
  onComplete?: () => void;
}

export function ImageGenerationPlaceholder({ prompt, onComplete }: ImageGenerationPlaceholderProps) {
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (isComplete) return;
    
    // Auto-complete after 12 seconds as a fallback
    const timer = setTimeout(() => {
      setIsComplete(true);
      onComplete?.();
    }, 12000);

    return () => clearTimeout(timer);
  }, [isComplete, onComplete]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative w-full max-w-lg mx-auto"
    >
      {/* Blurred placeholder image */}
      <div className="relative aspect-square rounded-xl overflow-hidden bg-gradient-to-br from-primary/20 to-purple-500/20 backdrop-blur-sm border border-border/50">
        {/* Animated gradient background */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-br from-blue-400/30 via-purple-500/30 to-pink-500/30"
          animate={{
            background: [
              "linear-gradient(45deg, rgba(59, 130, 246, 0.3), rgba(168, 85, 247, 0.3), rgba(236, 72, 153, 0.3))",
              "linear-gradient(90deg, rgba(168, 85, 247, 0.3), rgba(236, 72, 153, 0.3), rgba(59, 130, 246, 0.3))",
              "linear-gradient(135deg, rgba(236, 72, 153, 0.3), rgba(59, 130, 246, 0.3), rgba(168, 85, 247, 0.3))",
              "linear-gradient(45deg, rgba(59, 130, 246, 0.3), rgba(168, 85, 247, 0.3), rgba(236, 72, 153, 0.3))",
            ]
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "linear"
          }}
        />
        
        {/* Shimmer effect */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12"
          animate={{
            x: ["-100%", "100%"]
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />

         {/* Content overlay */}
         <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
           
           {/* Circular spinner */}
           <motion.div
             initial={{ opacity: 0, scale: 0.8 }}
             animate={{ opacity: 1, scale: 1 }}
             transition={{ delay: 0.1 }}
             className="mb-6"
           >
             <Loader2 className="w-16 h-16 text-primary animate-spin" />
           </motion.div>
           
           <motion.h3
             initial={{ opacity: 0, y: 10 }}
             animate={{ opacity: 1, y: 0 }}
             transition={{ delay: 0.2 }}
             className="text-lg font-semibold text-foreground mb-2"
           >
             Generating Image
           </motion.h3>
          
           <motion.p
             initial={{ opacity: 0, y: 10 }}
             animate={{ opacity: 1, y: 0 }}
             transition={{ delay: 0.3 }}
             className="text-sm text-muted-foreground line-clamp-2 max-w-xs"
           >
            {prompt}
          </motion.p>
        </div>
      </div>
    </motion.div>
  );
}