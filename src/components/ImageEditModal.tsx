import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useArcStore } from "@/store/useArcStore";
import { useToast } from "@/hooks/use-toast";
import { SmoothImage } from "@/components/ui/smooth-image";

interface ImageEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  originalPrompt?: string;
}

const MAX_CHARS = 500;

const SUGGESTIONS = [
  "Make it more photorealistic",
  "Change the background to a sunset",
  "Warmer, golden-hour lighting",
  "Add depth of field / bokeh",
  "Increase detail and sharpness",
  "Cinematic rim light",
  "4:5 portrait framing",
  "Remove background clutter",
];

export function ImageEditModal({ isOpen, onClose, imageUrl, originalPrompt }: ImageEditModalProps) {
  const [editInstruction, setEditInstruction] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeChips, setActiveChips] = useState<string[]>([]);
  const { addMessage } = useArcStore();
  const { toast } = useToast();

  const charsLeft = useMemo(() => Math.max(0, MAX_CHARS - editInstruction.length), [editInstruction]);

  const toggleChip = (text: string) => {
    setActiveChips((prev) => (prev.includes(text) ? prev.filter((t) => t !== text) : [...prev, text]));
  };

  const applyChipsToText = (base: string) => {
    if (activeChips.length === 0) return base.trim();
    const chips = activeChips.filter((c) => !base.toLowerCase().includes(c.toLowerCase()));
    if (chips.length === 0) return base.trim();
    const joiner = base.trim().length ? "; " : "";
    return `${base.trim()}${joiner}${chips.join("; ")}`.slice(0, MAX_CHARS);
  };

  const handleSubmit = async () => {
    const textWithChips = applyChipsToText(editInstruction);
    if (!textWithChips) {
      toast({
        title: "Add instructions",
        description: "Tell me how you'd like to change the image.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Compose a clean edit prompt for the transcript
      const editPrompt = originalPrompt
        ? `Edit this image (originally: "${originalPrompt}"): ${textWithChips}`
        : `Edit this image: ${textWithChips}`;

      // Signal ChatInput to do the actual edit (relies on its 'processImageEdit' listener)
      // Note: ChatInput's handleExternalImageEdit will add the user message, so we don't duplicate it here
      const editEvent = new CustomEvent("processImageEdit", {
        detail: {
          content: editPrompt,
          baseImageUrl: imageUrl,
          editInstruction: textWithChips,
        },
      });
      window.dispatchEvent(editEvent);

      toast({
        title: "Editing started",
        description: "Nano Banana is working on your update 🍌",
      });

      onClose();
      setEditInstruction("");
      setActiveChips([]);
    } catch (error) {
      console.error("Error starting image edit:", error);
      toast({
        title: "Error",
        description: "Failed to start image editing",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if ((e.key === "Enter" && (e.metaKey || e.ctrlKey)) || (e.key === "Enter" && !e.shiftKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      {/* Mobile-first glassmorphism modal */}
      <DialogContent className="w-full max-w-[100vw] sm:max-w-3xl p-0 overflow-hidden bg-background/95 backdrop-blur-xl border-border/40">
        <div className="flex flex-col h-[100dvh] sm:h-auto sm:max-h-[90vh]">
          {/* Header with glassmorphism */}
          <div className="px-5 pt-5 pb-3 border-b border-border/40 bg-muted/20 backdrop-blur-sm">
            <DialogHeader className="space-y-2">
              <DialogTitle className="text-lg sm:text-2xl flex items-center gap-2 font-semibold">
                <span className="text-2xl">🍌</span>
                Edit Image
              </DialogTitle>
              <DialogDescription className="text-sm sm:text-base text-muted-foreground">
                Describe how you'd like to change the image. Use the quick chips or type your own instructions.
              </DialogDescription>
            </DialogHeader>
          </div>

          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto px-5 pb-4 pt-4 scrollbar-hide">
            <div className="grid grid-cols-1 md:grid-cols-2 md:gap-6">
              {/* Preview with glassmorphism */}
              <div className="md:pr-6">
                <div className="w-full rounded-2xl overflow-hidden bg-muted/30 border border-border/40 backdrop-blur-sm">
                  <div className="w-full aspect-[4/5] sm:aspect-video">
                    <SmoothImage src={imageUrl} alt="Original" className="w-full h-full object-contain" />
                  </div>
                </div>

                {originalPrompt && (
                  <div className="mt-4 text-xs sm:text-sm text-muted-foreground">
                    <div className="font-medium text-foreground mb-1.5">Original prompt</div>
                    <div className="rounded-xl border border-border/40 bg-muted/20 backdrop-blur-sm p-3 leading-relaxed text-[16px]">
                      {originalPrompt}
                    </div>
                  </div>
                )}
              </div>

              {/* Controls */}
              <div className="pt-4 md:pt-0 flex flex-col min-h-[260px]">
                {/* Chips with glassmorphism */}
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-2 mb-4">
                  {SUGGESTIONS.map((s) => {
                    const active = activeChips.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => toggleChip(s)}
                        className={[
                          "px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-medium transition-all border backdrop-blur-sm text-left",
                          active
                            ? "bg-primary/20 border-primary/50 text-primary scale-[0.98]"
                            : "bg-muted/30 border-border/40 hover:bg-muted/50 hover:scale-[1.02]",
                        ].join(" ")}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>

                {/* Textarea with 16pt font */}
                <label className="text-sm font-medium mb-2 text-foreground">How would you like to edit this image?</label>
                <Textarea
                  value={editInstruction}
                  onChange={(e) => setEditInstruction(e.target.value.slice(0, MAX_CHARS))}
                  onKeyDown={handleKeyPress}
                  placeholder="e.g., make it more photorealistic, change the background to a sunset, add more detail…"
                  className="min-h-[96px] sm:min-h-[120px] resize-none text-[16px] bg-muted/20 backdrop-blur-sm border-border/40 focus-visible:ring-primary/50 rounded-xl"
                  style={{ fontSize: '16px' }}
                  disabled={isSubmitting}
                />
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Tip: Press ⌘↵ / Ctrl↵ to edit</span>
                  <span className={charsLeft === 0 ? "text-destructive font-medium" : ""}>{charsLeft} chars left</span>
                </div>
              </div>
            </div>
          </div>

          {/* Sticky Footer with glassmorphism */}
          <div className="px-5 py-4 border-t border-border/40 bg-muted/20 backdrop-blur-xl sticky bottom-0 sm:static">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2">
              <Button 
                variant="outline" 
                onClick={onClose} 
                disabled={isSubmitting} 
                className="sm:min-w-[120px] bg-background/50 backdrop-blur-sm border-border/40 hover:bg-muted/50"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || (!editInstruction.trim() && activeChips.length === 0)}
                className="sm:min-w-[140px] bg-primary hover:bg-primary/90"
              >
                {isSubmitting ? "Starting…" : "Edit Image"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
