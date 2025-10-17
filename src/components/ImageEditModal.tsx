import { useState, useMemo } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useArcStore } from "@/store/useArcStore";
import { useToast } from "@/hooks/use-toast";
import { SmoothImage } from "@/components/ui/smooth-image";
import { X, Sparkles } from "lucide-react";

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

      // Signal ChatInput to do the actual edit
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
      <DialogContent className="w-full max-w-[100vw] sm:max-w-2xl p-0 gap-0 overflow-hidden border-border/50" hideCloseButton>
        <div className="flex flex-col h-[100dvh] sm:h-auto sm:max-h-[90vh]">
          {/* Header */}
          <div className="relative px-6 pt-6 pb-4 border-b border-border/30">
            <button
              onClick={onClose}
              className="absolute right-4 top-4 rounded-full p-2 hover:bg-muted/50 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
            
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-full bg-primary/10">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-xl font-semibold">Edit Image</h2>
            </div>
            
            <p className="text-sm text-muted-foreground">
              Use quick suggestions or describe your changes
            </p>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
            {/* Original Prompt - Subtle, above image */}
            {originalPrompt && (
              <div className="text-xs text-muted-foreground">
                <span className="opacity-60">Original:</span>{" "}
                <span className="opacity-80">{originalPrompt}</span>
              </div>
            )}

            {/* Image Preview */}
            <div className="rounded-xl overflow-hidden border border-border/50 bg-muted/20">
              <div className="w-full aspect-video sm:aspect-[4/3]">
                <SmoothImage src={imageUrl} alt="Image to edit" className="w-full h-full object-contain" />
              </div>
            </div>

            {/* Quick Edit Chips */}
            <div>
              <label className="text-sm font-medium mb-3 block">Quick edits</label>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => {
                  const active = activeChips.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleChip(s)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                        active
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-muted/80 hover:bg-muted text-foreground/80 hover:text-foreground"
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Main Edit Textarea */}
            <div>
              <label className="text-sm font-medium mb-2 block">Describe your changes</label>
              <Textarea
                value={editInstruction}
                onChange={(e) => setEditInstruction(e.target.value.slice(0, MAX_CHARS))}
                onKeyDown={handleKeyPress}
                placeholder="e.g., make it more photorealistic, change the background to a sunset..."
                className="min-h-[100px] resize-none text-[16px] bg-background border-border/50 focus-visible:ring-primary/50"
                style={{ fontSize: '16px' }}
                disabled={isSubmitting}
              />
              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>Press ⌘↵ / Ctrl↵ to submit</span>
                <span className={charsLeft < 50 ? "text-warning" : ""}>{charsLeft} left</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-border/30 bg-muted/20">
            <div className="flex items-center justify-end gap-3">
              <Button 
                variant="outline" 
                onClick={onClose} 
                disabled={isSubmitting}
                className="min-w-[100px]"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || (!editInstruction.trim() && activeChips.length === 0)}
                className="min-w-[120px] bg-primary hover:bg-primary/90"
              >
                {isSubmitting ? (
                  <>
                    <Sparkles className="h-4 w-4 mr-2 animate-spin" />
                    Editing...
                  </>
                ) : (
                  "Edit Image"
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
