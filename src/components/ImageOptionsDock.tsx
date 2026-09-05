import { useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Ratio, Check, Images } from "lucide-react";
import {
  useImageGenStore,
  IMAGE_ASPECT_OPTIONS,
  EDIT_ASPECT_OPTIONS,
  type ImageAspectRatio,
  type EditAspectRatio,
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
 * Inner controls (aspect + count + usage meter). Can be
 * rendered inline inside another panel (e.g. the Selected Images preview) or
 * wrapped by <ImageOptionsDock /> for its own floating dock.
 *
 * `editMode` offers the source aspect ratio for edits.
 */
export function ImageOptionsContent({
  showUsage = true,
  editMode = false,
}: {
  showUsage?: boolean;
  editMode?: boolean;
}) {
  const {
    aspectRatio,
    editAspectRatio,
    count,
    setAspectRatio,
    setEditAspectRatio,
    setCount,
  } = useImageGenStore();

  const [openMenu, setOpenMenu] = useState<null | "aspect" | "count">(null);

  // Edits get their own shape list, including "Match original" — the default,
  // so an edit doesn't inherit the generation aspect and restretch the source.
  const aspectOptions = editMode ? EDIT_ASPECT_OPTIONS : IMAGE_ASPECT_OPTIONS;
  const currentAspect: EditAspectRatio = editMode ? editAspectRatio : aspectRatio;
  const activeAspect = aspectOptions.find((a) => a.id === currentAspect) ?? aspectOptions[0];
  const effectiveCount: ImageCount = count || 1;

  const handlePickAspect = (a: EditAspectRatio) => {
    if (editMode) setEditAspectRatio(a);
    else setAspectRatio(a as ImageAspectRatio);
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
        {/* Aspect ratio picker */}
        <div className="relative flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80 pl-1">Size</span>
          <button
            type="button"
            onClick={() => setOpenMenu(openMenu === "aspect" ? null : "aspect")}
            className="flex items-center gap-2 px-3 h-9 rounded-full border border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors text-sm text-foreground"
          >
            <Ratio className="h-3.5 w-3.5 text-primary" />
            <span className="font-medium">{activeAspect.id === 'source' ? 'Original' : activeAspect.id}</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>

          {openMenu === "aspect" && (
            <div className="absolute bottom-full mb-2 left-0 w-56 rounded-2xl border border-border/60 bg-background/95 backdrop-blur-xl shadow-xl p-1.5 z-20">
              {aspectOptions.map((a) => {
                const isActive = a.id === currentAspect;
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
