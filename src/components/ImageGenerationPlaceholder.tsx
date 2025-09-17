import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Progress } from "@/components/ui/progress";

interface ImageGenerationPlaceholderProps {
  prompt: string;
  onComplete?: () => void;
}

export function ImageGenerationPlaceholder({ prompt, onComplete }: ImageGenerationPlaceholderProps) {
  const [progress, setProgress] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (isComplete) return;
    
    const duration = 45000; // 45 seconds max wait
    const interval = 100; // Update every 100ms for smoother animation
    const increment = (interval / duration) * 100;

    const timer = setInterval(() => {
      setProgress((prev) => {
        const newProgress = prev + increment;
        if (newProgress >= 95) {
          // Slow down near the end but don't complete
          return Math.min(99, prev + increment * 0.1);
        }
        return newProgress;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [isComplete]);

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
           {/* Larger, more prominent loading spinner */}
           <motion.div
             initial={{ scale: 0 }}
             animate={{ scale: 1 }}
             transition={{ delay: 0.2, type: "spring" }}
             className="w-20 h-20 rounded-full bg-primary/10 backdrop-blur-sm border border-primary/20 flex items-center justify-center mb-6 relative"
           >
             {/* Outer spinning ring */}
             <motion.div
               animate={{ rotate: 360 }}
               transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
               className="absolute inset-1 border-2 border-transparent border-t-primary border-r-primary rounded-full"
             />
             {/* Inner spinning ring (opposite direction) */}
             <motion.div
               animate={{ rotate: -360 }}
               transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
               className="w-10 h-10 border-2 border-transparent border-b-primary/70 border-l-primary/70 rounded-full"
             />
           </motion.div>
          
          <motion.h3
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-lg font-semibold text-foreground mb-2"
          >
            Generating Image
          </motion.h3>
          
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="text-sm text-muted-foreground mb-6 line-clamp-2"
          >
            {prompt}
          </motion.p>

          {/* Progress bar */}
          <div className="w-full max-w-xs">
            <Progress 
              value={progress} 
              className="h-2 bg-background/50"
            />
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="text-xs text-muted-foreground mt-2"
            >
              {Math.round(progress)}%
            </motion.p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}