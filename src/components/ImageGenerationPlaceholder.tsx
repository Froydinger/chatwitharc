import { Loader2 } from "lucide-react";

interface ImageGenerationPlaceholderProps {
  prompt: string;
  onComplete?: () => void;
}

export function ImageGenerationPlaceholder({ prompt, onComplete }: ImageGenerationPlaceholderProps) {
  return (
    <div className="flex items-center justify-center">
      <div className="w-[100px] h-[100px] rounded-xl bg-background/60 backdrop-blur-sm border border-border/40 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    </div>
  );
}