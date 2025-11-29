import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Wand2 } from "lucide-react";

interface ImageGenerationPlaceholderProps {
  prompt: string;
  onComplete?: () => void;
}

export function ImageGenerationPlaceholder({ prompt, onComplete }: ImageGenerationPlaceholderProps) {
  const [isComplete, setIsComplete] = useState(false);
  const [dots, setDots] = useState(0);

  useEffect(() => {
    if (isComplete) return;

    // Auto-complete after 12 seconds as a fallback
    const timer = setTimeout(() => {
      setIsComplete(true);
      onComplete?.();
    }, 12000);

    return () => clearTimeout(timer);
  }, [isComplete, onComplete]);

  // Animated dots effect
  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev + 1) % 4);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="relative w-full max-w-2xl mx-auto"
    >
      {/* Glass container with themed gradient */}
      <div className="relative w-full aspect-square rounded-3xl overflow-hidden backdrop-blur-xl bg-gradient-to-br from-background/60 via-background/40 to-background/60 border border-border/40 shadow-2xl">

        {/* Animated orbs in background */}
        <motion.div
          className="absolute top-1/4 left-1/4 w-48 h-48 rounded-full"
          style={{
            background: "radial-gradient(circle, hsl(var(--primary) / 0.3), transparent 70%)",
            filter: "blur(40px)",
          }}
          animate={{
            scale: [1, 1.2, 1],
            x: [0, 20, 0],
            y: [0, -20, 0],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="absolute bottom-1/4 right-1/4 w-56 h-56 rounded-full"
          style={{
            background: "radial-gradient(circle, hsl(var(--primary) / 0.25), transparent 70%)",
            filter: "blur(50px)",
          }}
          animate={{
            scale: [1, 1.3, 1],
            x: [0, -30, 0],
            y: [0, 20, 0],
          }}
          transition={{
            duration: 5,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 0.5,
          }}
        />

        {/* Shimmer sweep */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
          style={{ width: "200%" }}
          animate={{
            x: ["-100%", "100%"],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "linear",
          }}
        />

        {/* Content overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center z-10">

          {/* Magic wand icon with sparkles */}
          <motion.div
            className="relative mb-6"
            animate={{
              rotate: [0, -10, 10, -10, 0],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <motion.div
              className="relative"
              animate={{
                y: [0, -8, 0],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <Wand2 className="w-16 h-16 text-primary-glow drop-shadow-lg" strokeWidth={1.5} />

              {/* Sparkle particles */}
              <AnimatePresence mode="wait">
                {[...Array(3)].map((_, i) => (
                  <motion.div
                    key={`sparkle-${i}-${Math.random()}`}
                    className="absolute"
                    style={{
                      top: `${20 + i * 10}%`,
                      left: `${20 + i * 20}%`,
                    }}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{
                      opacity: [0, 1, 0],
                      scale: [0, 1, 0],
                      rotate: [0, 180],
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      delay: i * 0.3,
                    }}
                  >
                    <Sparkles className="w-4 h-4 text-primary-glow" />
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          </motion.div>

          {/* Title with animated dots */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.3 }}
            className="mb-4"
          >
            <h3 className="text-xl font-semibold text-foreground drop-shadow-md">
              Crafting your image{".".repeat(dots)}
            </h3>
          </motion.div>

          {/* Prompt text */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.3 }}
            className="glass rounded-2xl px-6 py-3 border border-border/30 backdrop-blur-md max-w-sm"
          >
            <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
              {prompt}
            </p>
          </motion.div>

          {/* Progress indicator */}
          <motion.div
            className="mt-8 flex gap-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            {[...Array(3)].map((_, i) => (
              <motion.div
                key={i}
                className="w-2 h-2 rounded-full bg-primary"
                animate={{
                  scale: [1, 1.3, 1],
                  opacity: [0.4, 1, 0.4],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  delay: i * 0.2,
                }}
              />
            ))}
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}