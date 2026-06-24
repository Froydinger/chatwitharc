import { useState } from "react";
import { Sparkles, Check, X, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { enhancePrompt } from "@/services/enhancePrompt";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface PromptEnhancerProps {
  /** Current text in the input to be enhanced. */
  text: string;
  /** Called with the improved text only when the user accepts the preview. */
  onAccept: (improved: string) => void;
  kind?: "chat" | "image";
  className?: string;
}

/**
 * A tiny "✨ Enhance" chip. Tapping it asks GPT-5.4 Mini to rewrite the current
 * input, then shows the suggestion in a small popover with Accept / Dismiss —
 * the input is only changed if the user accepts. Non-disruptive: it renders
 * nothing until there's a few words of text to work with.
 */
export function PromptEnhancer({ text, onAccept, kind = "chat", className }: PromptEnhancerProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [suggestion, setSuggestion] = useState("");

  // Only offer enhancement once there's something meaningful to improve.
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < 2) return null;

  const run = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const improved = await enhancePrompt(text, kind);
      setSuggestion(improved);
      setOpen(true);
    } catch (e: any) {
      toast({
        title: "Couldn't enhance",
        description: e?.message || "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const accept = () => {
    onAccept(suggestion);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            if (!open) run();
          }}
          disabled={loading}
          aria-label="Enhance prompt"
          className={cn(
            "group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full",
            "border border-primary/40 bg-primary/10 backdrop-blur-md",
            "text-xs font-medium text-primary transition-all hover:bg-primary/20 hover:scale-105",
            "disabled:opacity-60 disabled:cursor-wait",
            className,
          )}
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          <span>{loading ? "Enhancing…" : "Enhance?"}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 p-3 glass-card border-white/10"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          Enhanced prompt
        </div>
        <div className="max-h-48 overflow-y-auto rounded-md bg-background/60 border border-border/50 p-2.5 text-sm text-foreground/90 whitespace-pre-wrap">
          {suggestion}
        </div>
        <div className="flex items-center justify-end gap-2 mt-3">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <X className="h-3.5 w-3.5" /> Dismiss
          </button>
          <button
            type="button"
            onClick={accept}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Check className="h-3.5 w-3.5" /> Use this
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
