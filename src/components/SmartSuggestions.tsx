import { useRef } from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

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
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex flex-col items-center gap-4 px-4"
    >
      {/* Suggestion Chips */}
      <div className="flex flex-wrap items-center justify-center gap-2 max-w-xl">
        {suggestions.map((suggestion, index) => (
          <motion.button
            key={suggestion.label}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, delay: index * 0.05, ease: "easeOut" }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelectPrompt(suggestion.fullPrompt || suggestion.prompt)}
            className="group relative px-4 py-2.5 rounded-full bg-background/40 backdrop-blur-sm border border-border/50 hover:border-primary/40 hover:bg-background/60 transition-all duration-300"
          >
            <span className="text-sm font-medium">{suggestion.label}</span>

            {/* Subtle hover glow */}
            <motion.div
              className="absolute inset-0 rounded-full bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity"
              initial={false}
            />
          </motion.button>
        ))}
      </div>

      {/* Expand Button */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: suggestions.length * 0.05 + 0.2 }}
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
