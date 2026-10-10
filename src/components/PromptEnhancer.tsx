import { useState } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import "@/workspace/workspace-create-modes.css";
import { Sparkles, Check, X, Loader2, ListTodo } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { enhancePrompt } from "@/services/enhancePrompt";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface PromptEnhancerProps {
  /** Current text in the input to be enhanced. */
  text: string;
  /** Called with the improved text only when the user accepts the preview. */
  onAccept: (improved: string) => void;
  kind?: "chat" | "image" | "git_plan";
  className?: string;
  workspaceUI?: boolean;
}

/**
 * An Enhance or Plan chip. Tapping it uses the existing prompt service to rewrite
 * or structure the current input into a plan or enhanced prompt.
 */
export function PromptEnhancer({ text, onAccept, kind = "chat", className, workspaceUI = false }: PromptEnhancerProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [suggestion, setSuggestion] = useState("");

  const isPlanMode = kind === "git_plan";

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
    } catch (e: unknown) {
      toast({
        title: isPlanMode ? "Couldn't generate plan" : "Couldn't enhance",
        description: e && typeof e === "object" && "message" in e && typeof e.message === "string" ? e.message : "Try again in a moment.",
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

  const PreviewContent = workspaceUI ? PopoverPrimitive.Content : PopoverContent;
  const preview = (
      <PreviewContent
        align="start"
        side={workspaceUI ? "top" : undefined}
        collisionPadding={workspaceUI ? 12 : undefined}
        className={workspaceUI ? "workspace-ui ws-prompt-enhancer-preview" : "w-80 p-3 glass-card border-white/10"}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-primary">
          {isPlanMode ? <ListTodo className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
          {isPlanMode ? "Git Implementation Plan" : "Enhanced prompt"}
        </div>
        <div className={cn("max-h-56 overflow-y-auto rounded-md bg-background/60 border border-border/50 p-2.5 text-sm text-foreground/90 whitespace-pre-wrap", workspaceUI && "ws-prompt-enhancer-text")}>
          {suggestion}
        </div>
        <div className="flex items-center justify-end gap-2 mt-3">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className={cn("inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors", workspaceUI && "ws-secondary-button")}
          >
            <X className="h-3.5 w-3.5" /> Dismiss
          </button>
          <button
            type="button"
            onClick={accept}
            className={cn("inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors", workspaceUI && "ws-primary-button")}
          >
            <Check className="h-3.5 w-3.5" /> {isPlanMode ? "Use Plan" : "Use this"}
          </button>
        </div>
      </PreviewContent>
  );

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
          aria-label={isPlanMode ? "Plan prompt" : "Enhance prompt"}
          className={cn(
            "group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full",
            "border border-primary/40 bg-primary/10 backdrop-blur-md",
            "text-xs font-medium text-primary transition-all hover:bg-primary/20 hover:scale-105",
            "disabled:opacity-60 disabled:cursor-wait",
            workspaceUI && "workspace-ui ws-prompt-enhancer-trigger",
            className,
          )}
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : isPlanMode ? (
            <ListTodo className="h-3 w-3" />
          ) : (
            <Sparkles className="h-3 w-3" />
          )}
          <span>{loading ? (isPlanMode ? "Planning…" : "Enhancing…") : (isPlanMode ? "Plan?" : "Enhance?")}</span>
        </button>
      </PopoverTrigger>
      {workspaceUI ? <PopoverPrimitive.Portal>{preview}</PopoverPrimitive.Portal> : preview}
    </Popover>
  );
}
