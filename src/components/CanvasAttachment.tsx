import { PenLine, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/store/useCanvasStore";

interface CanvasAttachmentProps {
  preview?: string;
  canvasContent: string;
  canvasLabel?: string;
  className?: string;
}

export const CanvasAttachment = ({
  preview,
  canvasContent,
  canvasLabel,
  className
}: CanvasAttachmentProps) => {
  const { openWithContent } = useCanvasStore();

  const handleOpen = () => {
    // Use atomic openWithContent to set content AND open canvas in one operation
    // This prevents race conditions where editor re-initializes with empty content
    openWithContent(canvasContent, 'writing');
  };

  // Generate preview from content if not provided
  const displayPreview = preview || canvasContent.slice(0, 120).replace(/\n/g, ' ');
  const wordCount = canvasContent.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className={cn(
      "group relative overflow-hidden rounded-lg border border-border/50 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent backdrop-blur-sm transition-all hover:border-primary/50 hover:shadow-lg",
      className
    )}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Canvas Icon */}
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-primary backdrop-blur-sm">
            <PenLine className="h-6 w-6" />
          </div>

          {/* Canvas Info */}
          <div className="min-w-0 flex-1">
            <h4 className="font-medium text-foreground">
              {canvasLabel || 'Canvas Draft'}
            </h4>
            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
              {displayPreview}...
            </p>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <span>{wordCount} words</span>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="mt-4">
          <Button
            size="sm"
            variant="outline"
            onClick={handleOpen}
            className="w-full gap-2 border-primary/30 hover:bg-primary/10 hover:border-primary/50"
          >
            <ExternalLink className="h-4 w-4" />
            Open Canvas
          </Button>
        </div>
      </div>

      {/* Hover Effect */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
    </div>
  );
};
