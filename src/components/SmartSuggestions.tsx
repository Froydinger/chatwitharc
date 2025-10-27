import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SmartSuggestionsProps {
  suggestions: Array<{ label: string; prompt: string }>;
  onSelectPrompt: (prompt: string) => void;
  onShowMore: () => void;
}

export function SmartSuggestions({ suggestions, onSelectPrompt, onShowMore }: SmartSuggestionsProps) {
  return (
    <div className="flex flex-col items-center gap-4 px-4">
      {/* Suggestion Chips */}
      <div className="flex flex-wrap items-center justify-center gap-2 max-w-xl">
        {suggestions.map((suggestion, index) => (
          <motion.button
            key={index}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.1 }}
            onClick={() => onSelectPrompt(suggestion.prompt)}
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
        transition={{ delay: 0.4 }}
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
    </div>
  );
}
