import { motion } from "framer-motion";
import { ThemedLogo } from "@/components/ThemedLogo";

interface VideoGenerationPlaceholderProps {
  prompt: string;
  /** 0-100 from the provider, when it reports one. */
  progress?: number;
  /** True when animating an existing still rather than rendering from text. */
  fromImage?: boolean;
}

/**
 * Renders take far longer than a still (tens of seconds to minutes), so this
 * shows real progress when the provider reports it and sets the expectation
 * that the wait is normal.
 */
export function VideoGenerationPlaceholder({ prompt, progress, fromImage }: VideoGenerationPlaceholderProps) {
  const pct = typeof progress === "number" && progress > 0 ? Math.min(100, Math.round(progress)) : null;

  return (
    <motion.div
      className="w-full max-w-md mx-auto bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden flex items-center justify-center"
      style={{ aspectRatio: "16 / 9", minHeight: "220px" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex flex-col items-center gap-5 p-8 w-full">
        <div className="relative flex items-center justify-center" style={{ willChange: "transform" }}>
          <motion.div
            className="h-16 w-16 animate-spin-slow"
            style={{ backfaceVisibility: "hidden", transform: "translateZ(0)", willChange: "transform" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ opacity: { duration: 0.4, ease: "easeOut" } }}
          >
            <ThemedLogo className="h-full w-full opacity-90" alt="Generating video" />
          </motion.div>
          <motion.div
            className="absolute inset-0 rounded-full bg-primary/20"
            style={{
              filter: "blur(28px)",
              backfaceVisibility: "hidden",
              transform: "translateZ(0)",
              willChange: "transform, opacity",
            }}
            initial={{ opacity: 0 }}
            animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.3, 0.6, 0.3] }}
            transition={{
              opacity: { duration: 0.4, ease: "easeOut" },
              scale: { duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: 0.4 },
            }}
          />
        </div>

        <div className="flex flex-col items-center gap-1.5 text-center w-full">
          <span className="text-lg font-semibold text-foreground/90 tracking-tight">
            {fromImage ? "Animating your image" : "Creating your video"}
          </span>
          <p className="text-xs text-muted-foreground/60 max-w-[240px] line-clamp-2">{prompt}</p>

          {pct !== null && (
            <div className="w-full max-w-[200px] mt-2 h-1 rounded-full bg-primary/10 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-primary/60"
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              />
            </div>
          )}

          <span className="text-[10px] text-muted-foreground/40 mt-1">
            This takes a minute — video renders are slow.
          </span>
        </div>
      </div>
    </motion.div>
  );
}
