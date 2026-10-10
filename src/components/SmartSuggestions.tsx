import { Transition } from "@/components/transitions/Transition";
import { useRef, useState, useEffect } from "react";
import { Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SmartSuggestionsProps {
  suggestions: Array<{ label: string; prompt: string; fullPrompt?: string }>;
  onSelectPrompt: (prompt: string) => void;
  onShowMore: () => void;
  workspaceUI?: boolean;
}

export function SmartSuggestions({ suggestions, onSelectPrompt, onShowMore, workspaceUI = false }: SmartSuggestionsProps) {
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
    <Transition preset="panel"><div
      className={`flex flex-col items-center gap-4 px-4${workspaceUI ? " ws-quick-prompts" : ""}`}
    >
      {/* Suggestion Chips - hidden on very short viewports */}
      {showChips && (
        <div className="flex flex-wrap items-center justify-center gap-2 max-w-sm sm:max-w-xl lg:max-w-2xl">
          {suggestions.map((suggestion, index) => (
            <Transition key={suggestion.label} preset="fade" delay={index * 0.04}><button
              onClick={() => onSelectPrompt(suggestion.fullPrompt || suggestion.prompt)}
              className={`arc-suggestion-chip group relative px-4 py-2.5 rounded-full bg-background/40 backdrop-blur-sm border border-border/50 hover:border-neon-500/35 hover:bg-background/60 transition-[background-color,border-color] duration-200${workspaceUI ? " ws-quick-prompt" : ""}`}
            >
              <span className="text-sm font-medium transition-colors group-hover:text-neon-600 dark:group-hover:text-neon-300">{suggestion.label}</span>
              <div
                className="absolute inset-0 rounded-full bg-neon-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
              />
            </button></Transition>
          ))}
        </div>
      )}

      {/* Expand Button - always visible */}
      <Transition preset="fade" delay={suggestions.length * 0.04 + 0.1}><div
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={onShowMore}
          className={`text-muted-foreground hover:text-neon-600 dark:hover:text-neon-300 gap-2 transition-colors${workspaceUI ? " ws-quick-ideas" : ""}`}
        >
        <Lightbulb className="h-4 w-4 text-muted-foreground group-hover:text-neon-400" />
          Quick Ideas
        </Button>
      </div></Transition>
    </div></Transition>
  );
}
