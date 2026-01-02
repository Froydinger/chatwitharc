import { PenLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CanvasTileProps {
  isOpen: boolean;
  hasContent: boolean;
  preview?: string;
  onOpen: () => void;
  onClose: () => void;
  className?: string;
}

export function CanvasTile({
  isOpen,
  hasContent,
  preview,
  onOpen,
  onClose,
  className,
}: CanvasTileProps) {
  // Always show a Canvas tile so users can open/close at will.
  // (We still show a helpful empty-state preview when there's no content.)

  return (
    <div className={cn("w-full", className)}>
      <div
        className={cn(
          "group rounded-2xl border border-border/40 bg-card/30 backdrop-blur-xl",
          "shadow-[0_10px_30px_-18px_hsl(var(--foreground)/0.35)]",
          "transition-colors",
          isOpen ? "bg-card/40" : "hover:bg-card/40",
        )}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0 flex items-center gap-3">
            <div
              className={cn(
                "h-9 w-9 rounded-xl grid place-items-center",
                "bg-primary/10 text-primary",
              )}
            >
              <PenLine className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Canvas</p>
              <p className="text-xs text-muted-foreground truncate">
                {preview?.trim()
                  ? preview.trim()
                  : "Tap to open your writing canvas"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {isOpen ? (
              <Button
                variant="outline"
                size="icon"
                className="rounded-full"
                onClick={onClose}
                title="Close canvas"
              >
                <X className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                variant="secondary"
                className="rounded-full"
                onClick={onOpen}
              >
                Open
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
