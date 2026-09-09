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
  blurOverride?: number;
  /** Bypass the admin "enabled" switch — the admin preview always renders. */
  forceEnabled?: boolean;
  className?: string;
}

export function ImageGenerationFx({
  children,
  images = [],
  presetOverride,
  pixelScaleOverride,
  blurOverride,
  forceEnabled,
  className,
}: ImageGenerationFxProps) {
  const config = useImgFxConfig();
  const enabled = forceEnabled || config.enabled;

  if (!enabled) return <>{children}</>;

  const blur = blurOverride !== undefined ? blurOverride : config.blur;

  return (
    <div
      className={["arc-imgfx relative rounded-2xl overflow-hidden", className].filter(Boolean).join(" ")}
      style={blur > 0 ? ({ ["--imgfx-blur" as any]: `${blur}px` } as React.CSSProperties) : undefined}
    >
      {blur > 0 && (
        <style>{`
          .arc-imgfx canvas {
            filter: blur(var(--imgfx-blur, 0px));
            transform: scale(1.05);
            transition: filter 0.2s ease;
          }
        `}</style>
      )}
      <Suspense
        fallback={
          <div style={blur > 0 ? { filter: `blur(${blur}px)` } : undefined}>
            {children}
          </div>
        }
      >
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
