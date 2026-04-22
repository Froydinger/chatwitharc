import { useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Crown, ImageIcon, Ratio, Sparkles, Check } from "lucide-react";
import {
  useImageGenStore,
  IMAGE_MODEL_OPTIONS,
  IMAGE_ASPECT_OPTIONS,
  type ImageModelId,
  type ImageAspectRatio,
} from "@/store/useImageGenStore";
import { useSubscription } from "@/hooks/useSubscription";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface ImageOptionsDockProps {
  /** The element to portal into (the floating dock parent). */
  portalRoot: HTMLElement | null;
  /** Bottom offset in CSS — should sit above the input bar. */
  bottomOffset?: string;
}

/**
 * Floating dock above the chat input that lets users pick the image model
 * and aspect ratio while in image-generation mode (e.g. /image, "draw…").
 * Visually mirrors the selected-images / selected-documents preview docks.
 */
export function ImageOptionsDock({ portalRoot, bottomOffset }: ImageOptionsDockProps) {
  const { model, aspectRatio, setModel, setAspectRatio } = useImageGenStore();
  const { isSubscribed } = useSubscription();
  const { toast } = useToast();

  const [openMenu, setOpenMenu] = useState<null | "model" | "aspect">(null);

  if (!portalRoot) return null;

  const activeModel = IMAGE_MODEL_OPTIONS.find((m) => m.id === model) ?? IMAGE_MODEL_OPTIONS[0];
  const activeAspect = IMAGE_ASPECT_OPTIONS.find((a) => a.id === aspectRatio) ?? IMAGE_ASPECT_OPTIONS[0];

  const handlePickModel = (m: ImageModelId) => {
    const target = IMAGE_MODEL_OPTIONS.find((o) => o.id === m);
    if (target?.pro && !isSubscribed) {
      toast({
        title: "Pro feature",
        description: `${target.label} is available with Pro. Sticking with ${activeModel.label}.`,
      });
      setOpenMenu(null);
      return;
    }
    setModel(m);
    setOpenMenu(null);
  };

  const handlePickAspect = (a: ImageAspectRatio) => {
    setAspectRatio(a);
    setOpenMenu(null);
  };

  return createPortal(
    <div
      className="fixed left-1/2 -translate-x-1/2 w-[min(760px,92vw)] z-[33]"
      style={{ bottom: bottomOffset ?? "calc(110px + env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="rounded-3xl border border-border/50 bg-background/80 backdrop-blur-xl shadow-xl px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ImageIcon className="h-4 w-4 text-primary" />
            <span>Image options</span>
          </div>
          <span className="text-[11px] text-muted-foreground hidden sm:inline">
            Pick model & aspect ratio
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Model picker */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenMenu(openMenu === "model" ? null : "model")}
              className={cn(
                "flex items-center gap-2 px-3 h-9 rounded-full border border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors text-sm text-foreground"
              )}
            >
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="font-medium">{activeModel.label}</span>
              {activeModel.pro && <Crown className="h-3 w-3 text-primary" />}
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>

            {openMenu === "model" && (
              <div className="absolute bottom-full mb-2 left-0 w-64 rounded-2xl border border-border/60 bg-background/95 backdrop-blur-xl shadow-xl p-1.5 z-10">
                {IMAGE_MODEL_OPTIONS.map((m) => {
                  const isActive = m.id === model;
                  const locked = !!m.pro && !isSubscribed;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handlePickModel(m.id)}
                      className={cn(
                        "w-full flex items-start gap-2 px-3 py-2 rounded-xl text-left transition-colors",
                        isActive ? "bg-primary/10" : "hover:bg-muted/40",
                        locked && "opacity-70"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-foreground truncate">{m.label}</span>
                          {m.pro && <Crown className="h-3 w-3 text-primary shrink-0" />}
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
          <div className="relative">
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
              <div className="absolute bottom-full mb-2 left-0 w-56 rounded-2xl border border-border/60 bg-background/95 backdrop-blur-xl shadow-xl p-1.5 z-10">
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
        </div>
      </div>
    </div>,
    portalRoot
  );
}
