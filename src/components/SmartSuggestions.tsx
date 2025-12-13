import { useRef } from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { slideUpVariants, staggerContainerVariants, staggerItemVariants, ANIMATION_DURATION, STAGGER, createHoverVariants, createTapVariants } from "@/utils/animations";

interface SmartSuggestionsProps {
  suggestions: Array<{ label: string; prompt: string; fullPrompt?: string }>;
  onSelectPrompt: (prompt: string) => void;
  onShowMore: () => void;
}

export function SmartSuggestions({ suggestions, onSelectPrompt, onShowMore }: SmartSuggestionsProps) {
  // Track if we've already animated once during this session
  const hasAnimated = useRef(false);

  // Check if we've animated in this browser session
  if (!hasAnimated.current) {
    const sessionKey = "arc_suggestions_animated";
    const alreadyAnimated = sessionStorage.getItem(sessionKey);

    if (!alreadyAnimated) {
      sessionStorage.setItem(sessionKey, "true");
      hasAnimated.current = false; // Will animate this time
    } else {
      hasAnimated.current = true; // Skip animation
    }
  }

  return (
    <motion.div
      variants={slideUpVariants}
      initial="initial"
      animate="animate"
      className="flex flex-col items-center gap-4 px-4"
    >
      {/* Suggestion Chips */}
      <motion.div
        className="flex flex-wrap items-center justify-center gap-2 max-w-xl"
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

            {/* Subtle hover glow */}
            <motion.div
              className="absolute inset-0 rounded-full bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
              initial={false}
            />
          </motion.button>
        ))}
      </motion.div>

      {/* Expand Button */}
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
          More prompts
        </Button>
      </motion.div>
    </motion.div>
  );
}
