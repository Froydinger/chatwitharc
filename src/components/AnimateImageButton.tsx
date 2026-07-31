import { Clapperboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useVideoAccess } from "@/hooks/useVideoAccess";
import { useArcStore } from "@/store/useArcStore";
import { useVideoGenStore } from "@/store/useVideoGenStore";

interface AnimateImageButtonProps {
  imageUrl: string;
}

/**
 * Turns a generated still into a short clip, using it as the video's first
 * frame.
 *
 * Hidden entirely for accounts without video access — there's no upsell,
 * because the feature isn't for sale while the provider is on its way out.
 */
export function AnimateImageButton({ imageUrl }: AnimateImageButtonProps) {
  const { canGenerateVideo } = useVideoAccess();
  const isGenerating = useArcStore((s) => s.isGeneratingImage);
  const seconds = useVideoGenStore((s) => s.seconds);

  if (!canGenerateVideo) return null;

  const handleAnimate = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.dispatchEvent(
      new CustomEvent("processAnimateImage", {
        detail: { imageUrl, prompt: "Bring this image to life with subtle, natural motion" },
      }),
    );
  };

  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            disabled={isGenerating}
            onClick={handleAnimate}
            className="rounded-full h-8 px-4 gap-1.5 border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40"
          >
            <Clapperboard className="w-3.5 h-3.5" />
            Animate
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[220px] text-xs leading-snug">
          Turn this image into a {seconds}-second video. It'll be saved on this device only — download it
          if you want to keep it.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
