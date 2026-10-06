import { ImageCreditSummary } from "@/components/ImageCreditSummary";
import { createPortal } from "react-dom";
import { ConditionalTransition } from "@/components/transitions/ConditionalTransition";
import { TransitionPart } from "@/components/transitions/TransitionPart";
import { Sparkles, X } from "lucide-react";

/** Presentation only; quotas, navigation and checkout remain composer-owned. */
export function ComposerOverlays({ showLimitsModal, isBoostTier, hasBoost, imageUsagePercent, imageUnlimited = false, onClose, onSettings, onUpgrade }: {
  showLimitsModal: boolean;
  isBoostTier: boolean;
  hasBoost: boolean;
  imageUsagePercent: number;
  imageUnlimited?: boolean;
  onClose: () => void;
  onSettings: () => void;
  onUpgrade: () => void;
}) {
  return createPortal(
        <>
          <ConditionalTransition preset="fade">{showLimitsModal && (
              <div
                className="fixed inset-0 z-[500] bg-black/60 backdrop-blur-md"
                onClick={() => onClose()}
              />
          )}</ConditionalTransition>
          <ConditionalTransition preset="fade">{showLimitsModal && (
              <div className="fixed inset-0 z-[501] flex items-center justify-center p-4 pointer-events-none">
                <TransitionPart><div
                  className="pointer-events-auto w-[min(90vw,420px)] rounded-3xl border border-black/10 dark:border-white/10 bg-background/95 backdrop-blur-2xl shadow-2xl p-6 flex flex-col gap-5 text-foreground relative overflow-hidden"
                >
                  {/* Close button */}
                  <button
                    onClick={() => onClose()}
                    className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>

                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-2xl bg-primary/15 text-primary border border-primary/20">
                      <Sparkles className="h-5 w-5 animate-pulse" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold">Image usage</h3>
                      <p className="text-[10px] text-muted-foreground">{isBoostTier ? "Shared monthly credits with ArcAI Boost" : "Less usage on Free"}</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-4 py-1">
                    <ImageCreditSummary compact />
                    {/* Active Model Progress Card */}
                    <div className="space-y-2.5 p-4 rounded-2xl bg-white/5 border border-black/10 dark:border-white/5 backdrop-blur-md">
                      <div className="flex justify-between items-center text-xs font-semibold text-muted-foreground">
                        <span>Status: <strong className="text-foreground">{imageUnlimited ? "Unlimited images" : isBoostTier ? "Boost monthly credits" : "Free monthly images"}</strong></span>
                        <span className="tabular-nums text-foreground">{imageUnlimited ? "Unlimited" : `${imageUsagePercent}% used`}</span>
                      </div>
                      <div className="w-full bg-black/30 rounded-full h-2.5 overflow-hidden border border-black/10 dark:border-white/5 p-0.5">
                        <div
                          className="bg-primary h-full rounded-full transition-[width] duration-200 motion-reduce:transition-none"
                          style={{ width: imageUnlimited ? "100%" : `${Math.min(100, imageUsagePercent)}%` }}
                        />
                      </div>
                    </div>


                  </div>

                  <div className="flex gap-3 mt-1">
                    <button
                      onClick={() => {
                        onClose();
                        onSettings();
                      }}
                      className="flex-1 h-11 rounded-xl text-xs font-medium border border-black/10 dark:border-white/10 hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      Detailed Settings
                    </button>
                    {!hasBoost && (
                      <button
                        onClick={() => {
                          onClose();
                          onUpgrade();
                        }}
                        className="flex-1 h-11 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/95 transition-colors cursor-pointer"
                      >
                        Upgrade to Boost
                      </button>
                    )}
                  </div>
                </div></TransitionPart>
              </div>
          )}</ConditionalTransition>
        </>,
        document.body
      );
}
