import { Dialog, DialogContent } from "@/components/ui/dialog";
import { GlassButton } from "@/components/ui/glass-button";
import { Sparkles, Check } from "lucide-react";

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  userName?: string;
}

// ArcAI is free for everyone. This modal now celebrates that and explains
// the only soft limit (10 images/day for non-admins). All previous upgrade /
// checkout flows are gone.
export function UpgradeModal({ isOpen, onClose }: UpgradeModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md glass-card border-white/10">
        <div className="text-center pt-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/15 mb-4">
            <Sparkles className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-2xl font-bold mb-2">ArcAI is free for everyone</h2>
          <p className="text-sm text-muted-foreground mb-6">
            No subscription, no checkout. Just sign in and you're in.
          </p>

          <ul className="text-left space-y-2.5 mb-6">
            {[
              "Unlimited chats with every model",
              "Unlimited voice mode",
              "10 image generations per day",
              "Web search, files, memory, canvases — all included",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm">
                <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <GlassButton className="w-full" onClick={onClose}>
            Got it
          </GlassButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
