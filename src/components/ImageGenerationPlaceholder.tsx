import { Transition } from "@/components/transitions/Transition";
import { ThemedLogo } from "@/components/ThemedLogo";
import { ImageGenerationFx } from "@/components/ImageGenerationFx";

interface ImageGenerationPlaceholderProps {
  prompt: string;
  onComplete?: () => void;
}

export function ImageGenerationPlaceholder({ prompt, onComplete }: ImageGenerationPlaceholderProps) {
  return (
    /* img-fx paints the card's surface, so the child drops its own fill and
       backdrop-blur — keeping them would sit a frosted sheet on top of the
       shader and wash it out. The border and radius stay on the child so the
       effect is clipped to the same rounded box. */
    <ImageGenerationFx className="w-full max-w-sm mx-auto">
    <Transition preset="fade"><div
      className="w-full rounded-2xl border border-white/10 overflow-hidden flex items-center justify-center"
      style={{ aspectRatio: '1 / 1', minHeight: '320px' }}
    >
      <div className="flex flex-col items-center gap-6 p-8">
        <div className="relative flex items-center justify-center" style={{ willChange: 'transform' }}>
          <Transition preset="fade"><div>
            <div className="arc-image-thinking-spin h-24 w-24 animate-spin-slow" style={{ backfaceVisibility: 'hidden', transform: 'translateZ(0)', willChange: 'transform' }}>
              <ThemedLogo className="h-full w-full opacity-90" alt="Generating" />
            </div>
          </div></Transition>
          <div className="arc-image-placeholder-glow absolute inset-0 rounded-full bg-primary/20" style={{ filter: 'blur(32px)', backfaceVisibility: 'hidden', transform: 'translateZ(0)', willChange: 'transform, opacity' }} />
        </div>
        <div className="flex flex-col items-center gap-2 text-center">
          <Transition preset="panel"><span
            className="text-xl font-semibold text-foreground/90 tracking-tight"
          >
            Creating your image
          </span></Transition>
          <Transition preset="fade" delay={0.2}><p
            className="text-sm text-muted-foreground/60 max-w-[200px] line-clamp-2"
          >
            {prompt}
          </p></Transition>
        </div>
      </div>
    </div></Transition>
    </ImageGenerationFx>
  );
}
