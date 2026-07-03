import { useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Ratio, Sparkles, Check, Images } from "lucide-react";
import {
  useImageGenStore,
  IMAGE_MODEL_OPTIONS,
  IMAGE_ASPECT_OPTIONS,
  type ImageModelId,
  type ImageAspectRatio,
  type ImageCount,
} from "@/store/useImageGenStore";
import { cn } from "@/lib/utils";
import { UsageMeter } from "@/components/UsageMeter";


interface ImageOptionsDockProps {
  /** The element to portal into (the floating dock parent). */
  portalRoot: HTMLElement | null;
  /** Bottom offset in CSS — should sit above the input bar. */
  bottomOffset?: string;
  /** Optional precise horizontal anchor (px from viewport left). */
  leftPx?: number;
  /** Optional explicit width in px to match input bar. */
  widthPx?: number;
}

/**
 * Inner controls (model + aspect + usage meter). Can be rendered inline
 * inside another panel (e.g. the Selected Images preview) or wrapped by
 * <ImageOptionsDock /> for its own floating dock.
 */
export function ImageOptionsContent({ showUsage = true }: { showUsage?: boolean }) {
  const { model, aspectRatio, count, setModel, setAspectRatio, setCount } = useImageGenStore();

  const [openMenu, setOpenMenu] = useState<null | "model" | "aspect" | "count">(null);

  const activeModel = IMAGE_MODEL_OPTIONS.find((m) => m.id === model) ?? IMAGE_MODEL_OPTIONS[0];
  const activeAspect = IMAGE_ASPECT_OPTIONS.find((a) => a.id === aspectRatio) ?? IMAGE_ASPECT_OPTIONS[0];
  const effectiveCount: ImageCount = count || 1;

  const handlePickModel = (m: ImageModelId) => {
    setModel(m);
    setOpenMenu(null);
  };

  const handlePickAspect = (a: ImageAspectRatio) => {
    setAspectRatio(a);
    setOpenMenu(null);
  };

  return (
    <>
      {showUsage && (
        <div className="flex items-center justify-end gap-3 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <UsageMeter kind="image" />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        {/* Model picker */}
        <div className="relative flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80 pl-1">Model</span>
          <button
            type="button"
            onClick={() => setOpenMenu(openMenu === "model" ? null : "model")}
            className={cn(
              "flex items-center gap-2 px-3 h-9 rounded-full border border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors text-sm text-foreground"
            )}
          >
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="font-medium">{activeModel.label}</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>

          {openMenu === "model" && (
            <div className="absolute bottom-full mb-2 left-0 w-64 rounded-2xl border border-border/60 bg-background/95 backdrop-blur-xl shadow-xl p-1.5 z-20">
              {IMAGE_MODEL_OPTIONS.map((m) => {
                const isActive = m.id === model;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handlePickModel(m.id)}
                    className={cn(
                      "w-full flex items-start gap-2 px-3 py-2 rounded-xl text-left transition-colors",
                      isActive ? "bg-primary/10" : "hover:bg-muted/40",
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-foreground truncate">{m.label}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{m.blurb}</p>
                    </div>
                    {isActive && <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Aspect ratio picker */}
        <div className="relative flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80 pl-1">Size</span>
          <button
            type="button"
            onClick={() => setOpenMenu(openMenu === "aspect" ? null : "aspect")}
            className="flex items-center gap-2 px-3 h-9 rounded-full border border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors text-sm text-foreground"
          >
            <Ratio className="h-3.5 w-3.5 text-primary" />
            <span className="font-medium">{activeAspect.id}</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>

          {openMenu === "aspect" && (
            <div className="absolute bottom-full mb-2 left-0 w-56 rounded-2xl border border-border/60 bg-background/95 backdrop-blur-xl shadow-xl p-1.5 z-20">
              {IMAGE_ASPECT_OPTIONS.map((a) => {
                const isActive = a.id === aspectRatio;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => handlePickAspect(a.id)}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 rounded-xl text-left text-sm transition-colors",
                      isActive ? "bg-primary/10 text-foreground" : "hover:bg-muted/40 text-foreground"
                    )}
                  >
                    <span>{a.label}</span>
                    {isActive && <Check className="h-4 w-4 text-primary" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Each output counts toward the 20/day allowance. */}
          <div className="relative flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80 pl-1">Count</span>
            <button
              type="button"
              onClick={() => setOpenMenu(openMenu === "count" ? null : "count")}
              className="flex items-center gap-2 px-3 h-9 rounded-full border border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors text-sm text-foreground"
            >
              <Images className="h-3.5 w-3.5 text-primary" />
              <span className="font-medium">{effectiveCount}x</span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>

            {openMenu === "count" && (
              <div className="absolute bottom-full mb-2 left-0 w-40 rounded-2xl border border-border/60 bg-background/95 backdrop-blur-xl shadow-xl p-1.5 z-20">
                {([1, 2, 3] as ImageCount[]).map((c) => {
                  const isActive = c === effectiveCount;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => { setCount(c); setOpenMenu(null); }}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2 rounded-xl text-left text-sm transition-colors",
                        isActive ? "bg-primary/10 text-foreground" : "hover:bg-muted/40 text-foreground"
                      )}
                    >
                      <span>{c} {c === 1 ? "image" : "images"}</span>
                      {isActive && <Check className="h-4 w-4 text-primary" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
      </div>
    </>
  );
}


/**
 * Floating dock above the chat input that lets users pick the image model
 * and aspect ratio while in image-generation mode (e.g. /image, "draw…").
 */
export function ImageOptionsDock({ portalRoot, bottomOffset, leftPx, widthPx }: ImageOptionsDockProps) {
  if (!portalRoot) return null;

  const useAnchored = typeof leftPx === "number" && typeof widthPx === "number";
  const style: React.CSSProperties = useAnchored
    ? {
        bottom: bottomOffset ?? "calc(110px + env(safe-area-inset-bottom, 0px))",
        left: `${leftPx}px`,
        width: `${widthPx}px`,
      }
    : { bottom: bottomOffset ?? "calc(110px + env(safe-area-inset-bottom, 0px))" };

  return createPortal(
    <div
      className={
        useAnchored
          ? "fixed z-[33]"
          : "fixed left-1/2 -translate-x-1/2 w-[min(760px,92vw)] z-[33]"
      }
      style={style}
    >
      <div className="rounded-3xl border border-border/50 bg-background/80 backdrop-blur-xl shadow-xl px-4 py-3 mx-auto max-w-[760px]">
        <ImageOptionsContent />
      </div>
    </div>,
    portalRoot
  );
}
