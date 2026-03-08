import { useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { slideUpVariants, staggerContainerVariants, staggerItemVariants, ANIMATION_DURATION, STAGGER, createHoverVariants, createTapVariants } from "@/utils/animations";

interface SmartSuggestionsProps {
  suggestions: Array<{ label: string; prompt: string; fullPrompt?: string }>;
  onSelectPrompt: (prompt: string) => void;
  onShowMore: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function SmartSuggestions({ suggestions, onSelectPrompt, onShowMore, onRefresh, isRefreshing = false }: SmartSuggestionsProps) {
  const hasAnimated = useRef(false);
  const [showChips, setShowChips] = useState(true);

  // Hide chips when viewport is too short for them to fit
  useEffect(() => {
    const check = () => setShowChips(window.innerHeight >= 500);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  if (!hasAnimated.current) {
    const sessionKey = "arc_suggestions_animated";
    const alreadyAnimated = sessionStorage.getItem(sessionKey);
    if (!alreadyAnimated) {
      sessionStorage.setItem(sessionKey, "true");
      hasAnimated.current = false;
    } else {
      hasAnimated.current = true;
    }
  }

  return (
    <motion.div
      variants={slideUpVariants}
      initial="initial"
      animate="animate"
      className="flex flex-col items-center gap-4 px-4"
    >
      {/* Suggestion Chips - hidden on very short viewports */}
      {showChips && (
        <>
          {/* Refresh Button */}
          {onRefresh && (
            <div className="flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <RefreshCw className={`h-3 w-3 transition-transform ${isRefreshing ? "animate-spin" : ""}`} />
              </Button>
            </div>
          )}

          <motion.div
            className="flex flex-wrap items-center justify-center gap-2 max-w-sm sm:max-w-xl lg:max-w-2xl"
            variants={staggerContainerVariants}
            initial="initial"
            animate="animate"
          >
            {suggestions.map((suggestion) => (
              <motion.button
                key={suggestion.label}
                variants={staggerItemVariants}
                whileHover={createHoverVariants(1.05, 0)}
                whileTap={createTapVariants(0.98)}
                onClick={() => onSelectPrompt(suggestion.fullPrompt || suggestion.prompt)}
                className="group relative px-4 py-2.5 rounded-full bg-background/40 backdrop-blur-sm border border-border/50 hover:border-primary/40 hover:bg-background/60 transition-all duration-200"
              >
                <span className="text-sm font-medium">{suggestion.label}</span>
                <motion.div
                  className="absolute inset-0 rounded-full bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                  initial={false}
                />
              </motion.button>
            ))}
          </motion.div>
        </>
      )}

      {/* Expand Button - always visible */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: ANIMATION_DURATION.STANDARD, delay: suggestions.length * STAGGER.NORMAL + 0.1 }}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={onShowMore}
          className="text-muted-foreground hover:text-foreground gap-2"
        >
        <Sparkles className="h-4 w-4" />
          Quick Ideas
        </Button>
      </motion.div>
    </motion.div>
  );
}
