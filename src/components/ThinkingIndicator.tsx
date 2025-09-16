import { Brain, Sparkles } from "lucide-react";

interface ThinkingIndicatorProps {
  isLoading: boolean;
  isGeneratingImage: boolean;
}

export function ThinkingIndicator({ isLoading, isGeneratingImage }: ThinkingIndicatorProps) {
  const showThinking = isLoading || isGeneratingImage;
  
  return (
    <div className="flex justify-center">
      <div className="thinking-shell" data-show={showThinking ? "true" : "false"} aria-live="polite">
        <div className="surface thinking-pill rounded-full">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center">
              <Brain className="h-5 w-5 animate-bounce-slow" />
              <Sparkles className="h-3 w-3 absolute -top-1 -right-1 animate-twinkle" />
            </div>
            <span className="text-sm text-muted-foreground">
              {isGeneratingImage ? "Generating image..." : "Arc is thinking..."}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}