import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Clapperboard, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVideoGenStore } from "@/store/useVideoGenStore";

const MAX_CHARS = 500;

const SUGGESTIONS = [
  "Slow push in, subtle natural motion",
  "Gentle camera pan to the right",
  "Hair and clothing drift in a soft breeze",
  "Clouds drift, light shifts warmer",
  "Subject turns slowly toward the camera",
  "Handheld drift with shallow depth of field",
];

export interface AnimateCandidate {
  file: File;
  previewUrl: string;
}

interface AnimateAttachmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  images: AnimateCandidate[];
  onAnimate: (file: File, prompt: string) => void;
}

/**
 * Prompt entry for animating an attached still.
 *
 * The chosen image becomes the video's first frame, so the prompt describes
 * the *motion* rather than the scene — the scene is already fixed by the
 * picture. Placeholder and suggestions are written to steer that way.
 */
export function AnimateAttachmentModal({ isOpen, onClose, images, onAnimate }: AnimateAttachmentModalProps) {
  const [prompt, setPrompt] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const seconds = useVideoGenStore((s) => s.seconds);

  // Reset per opening, and keep the selection valid if attachments changed
  // while the modal was closed.
  useEffect(() => {
    if (isOpen) {
      setPrompt("");
      setSelectedIndex(0);
    }
  }, [isOpen]);

  const selected = images[selectedIndex] ?? images[0];
  if (!selected) return null;

  const handleSubmit = () => {
    const trimmed = prompt.trim().slice(0, MAX_CHARS);
    onAnimate(selected.file, trimmed || "Bring this image to life with subtle, natural motion");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="glass-card max-w-md">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Clapperboard className="w-4 h-4 text-primary" />
            <h2 className="text-base font-semibold">Animate image</h2>
          </div>

          <div className="rounded-2xl overflow-hidden border border-border/40 bg-black/20">
            <img
              src={selected.previewUrl}
              alt="Frame to animate"
              className="w-full h-auto max-h-[240px] object-contain"
            />
          </div>

          {images.length > 1 && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Which image should the video start from?</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {images.map((img, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelectedIndex(i)}
                    className={cn(
                      "shrink-0 rounded-xl overflow-hidden border-2 transition-colors",
                      i === selectedIndex ? "border-primary" : "border-transparent opacity-60 hover:opacity-100",
                    )}
                  >
                    <img src={img.previewUrl} alt={`Option ${i + 1}`} className="w-12 h-12 object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value.slice(0, MAX_CHARS))}
              placeholder="Describe the motion — the image is already the first frame."
              className="glass border-0 bg-white/10 rounded-xl min-h-[80px] resize-none"
              autoFocus
            />
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setPrompt(s)}
                  className="text-[11px] px-2 py-1 rounded-full bg-primary/10 text-primary/80 hover:bg-primary/20 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground/70 leading-snug">
            <Info className="w-3 h-3 mt-0.5 shrink-0" />
            <span>
              {seconds}-second clip. Saved on this device only — it won't sync to your other devices, and
              clearing your cache deletes it. Download it to keep it.
            </span>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={onClose} className="rounded-full">
              Cancel
            </Button>
            <Button onClick={handleSubmit} className="rounded-full gap-1.5">
              <Clapperboard className="w-3.5 h-3.5" />
              Animate
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
