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
      const editPrompt = originalPrompt
        ? `Edit this image (originally: "${originalPrompt}"): ${textWithChips}`
        : `Edit this image: ${textWithChips}`;

      await addMessage({
        content: editPrompt,
        role: "user",
        type: "image",
        imageUrls: [imageUrl],
      });

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
      {/* bigger canvas, edge-to-edge content with a clean split layout */}
      <DialogContent className="w-full max-w-3xl p-0 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-3 border-b bg-gradient-to-b from-background/40 to-background">
          <DialogHeader className="space-y-2">
            <DialogTitle className="text-xl sm:text-2xl flex items-center gap-2">
              <span className="text-lg sm:text-xl animate-pulse drop-shadow-[0_0_8px_rgba(250,204,21,.8)]">🍌</span>
              Edit Image
            </DialogTitle>
            <DialogDescription className="text-sm sm:text-base">
              Describe how you’d like to change the image. Use chips or type your own instructions.
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Body */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 md:gap-6 p-6 pt-4">
          {/* Preview panel */}
          <div className="md:border-r md:pr-6 flex flex-col">
            <div className="aspect-square w-full rounded-xl overflow-hidden bg-muted/40 border">
              <SmoothImage src={imageUrl} alt="Original" className="w-full h-full object-contain" />
            </div>

            {originalPrompt && (
              <div className="mt-4 text-sm text-muted-foreground">
                <div className="font-medium text-foreground mb-1">Original prompt</div>
                <div className="rounded-lg border bg-card/60 p-3 leading-relaxed">{originalPrompt}</div>
              </div>
            )}
          </div>

          {/* Controls panel */}
          <div className="pt-4 md:pt-0 flex flex-col min-h-[280px]">
            {/* Chips */}
            <div className="flex flex-wrap gap-2 mb-3">
              {SUGGESTIONS.map((s) => {
                const active = activeChips.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleChip(s)}
                    className={[
                      "px-3 py-1.5 rounded-full text-xs font-medium transition-colors border",
                      active
                        ? "bg-yellow-400/20 border-yellow-400/50 text-yellow-700 dark:text-yellow-300"
                        : "bg-muted/40 border-border hover:bg-muted/70",
                    ].join(" ")}
                  >
                    {s}
                  </button>
                );
              })}
            </div>

            {/* Textarea */}
            <div className="flex-1 flex flex-col">
              <label className="text-sm font-medium mb-1.5">How would you like to edit this image?</label>
              <Textarea
                value={editInstruction}
                onChange={(e) => setEditInstruction(e.target.value.slice(0, MAX_CHARS))}
                onKeyDown={handleKeyPress}
                placeholder="e.g., make it more photorealistic, change the background to a sunset, add more detail…"
                className="min-h-[100px] resize-none focus-visible:ring-yellow-400"
                disabled={isSubmitting}
              />
              <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
                <span>Tip: Press ⌘↵ / Ctrl↵ to edit</span>
                <span className={charsLeft === 0 ? "text-destructive" : ""}>{charsLeft} chars left</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer (sticky on mobile) */}
        <div className="px-6 py-4 border-t bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky bottom-0 md:static">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={isSubmitting} className="sm:min-w-[120px]">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || (!editInstruction.trim() && activeChips.length === 0)}
              className="sm:min-w-[140px]"
            >
              {isSubmitting ? "Starting…" : "Edit Image"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
