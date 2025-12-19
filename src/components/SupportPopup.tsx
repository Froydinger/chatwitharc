import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExternalLink, Heart } from "lucide-react";

interface SupportPopupProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SupportPopup({ isOpen, onClose }: SupportPopupProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md glass border-primary/20">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <Heart className="h-5 w-5 fill-current" />
            Support ArcAI
          </DialogTitle>
          <DialogDescription>
            Help us continue building amazing tools and supporting causes we believe in.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          {/* Support ArcAI Button */}
          <a
            href="https://winthenight.org/support"
            target="_blank"
            rel="noopener noreferrer"
            className="block"
          >
            <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground justify-between group noir-send-btn">
              <span>Support ArcAI</span>
              <ExternalLink className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
            </Button>
          </a>

          {/* Learn More about Win The Night */}
          <a
            href="https://winthenight.org/about"
            target="_blank"
            rel="noopener noreferrer"
            className="block"
          >
            <Button
              variant="outline"
              className="w-full justify-between group glass border-glass-border"
            >
              <span>More about Win The Night</span>
              <ExternalLink className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
            </Button>
          </a>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Win The Night is dedicated to supporting the next generation of builders.
        </p>
      </DialogContent>
    </Dialog>
  );
}
