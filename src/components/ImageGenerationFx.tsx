import { Suspense, lazy } from "react";
import { useImgFxConfig, type ImgFxPreset } from "@/hooks/useThinkingOrbConfig";

/**
 * img-fx pulls in three.js and compiles WebGL shaders, so it is code-split and
 * only fetched once an image is actually generating. Everything below renders
 * the plain surface until that chunk lands, and permanently if WebGL is absent.
 */
const ImageGeneration = lazy(async () => {
  const mod = await import("img-fx");
  return { default: mod.ImageGeneration };
});

interface ImageGenerationFxProps {
  /** The surface the effect plays over — sized and rounded by the caller. */
  children: React.ReactNode;
  /** Reveal pool. Empty is fine: the shader runs on its own as a loader. */
  images?: string[];
  presetOverride?: ImgFxPreset;
  pixelScaleOverride?: number;
  /** Bypass the admin "enabled" switch — the admin preview always renders. */
  forceEnabled?: boolean;
  className?: string;
}

export function ImageGenerationFx({
  children,
  images = [],
  presetOverride,
  pixelScaleOverride,
  forceEnabled,
  className,
}: ImageGenerationFxProps) {
  const config = useImgFxConfig();
  const enabled = forceEnabled || config.enabled;

  if (!enabled) return <>{children}</>;

  return (
    <div className={["arc-imgfx", className].filter(Boolean).join(" ")}>
      <Suspense fallback={children}>
        <ImageGeneration
          preset={presetOverride ?? config.preset}
          pixelScale={pixelScaleOverride ?? config.pixelScale}
          images={images}
          autoReveal={images.length > 0}
          theme="auto"
        >
          {children}
        </ImageGeneration>
      </Suspense>
    </div>
  );
}
