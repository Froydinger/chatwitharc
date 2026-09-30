import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, X } from "lucide-react";

/** Presentation only; quotas, navigation and checkout remain composer-owned. */
export function ComposerOverlays({ showLimitsModal, isBoostTier, hasBoost, dailyImagesUsed, onClose, onSettings, onUpgrade }: {
  showLimitsModal: boolean;
  isBoostTier: boolean;
  hasBoost: boolean;
  dailyImagesUsed: number;
  onClose: () => void;
  onSettings: () => void;
  onUpgrade: () => void;
}) {
  return createPortal(
        <AnimatePresence>
          {showLimitsModal && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[500] bg-black/60 backdrop-blur-md"
                onClick={() => onClose()}
              />
              <div className="fixed inset-0 z-[501] flex items-center justify-center p-4 pointer-events-none">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 15 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 15 }}
                  transition={{ type: "spring", stiffness: 350, damping: 28 }}
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
                      <h3 className="text-base font-semibold">Image Quotas & Models</h3>
                      <p className="text-[10px] text-muted-foreground">{isBoostTier ? "Unlimited access with ArcAI Boost" : "Free accounts get 3 images total"}</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-4 py-1">
                    {/* Active Model Progress Card */}
                    <div className="space-y-2.5 p-4 rounded-2xl bg-white/5 border border-black/10 dark:border-white/5 backdrop-blur-md">
                      <div className="flex justify-between items-center text-xs font-semibold text-muted-foreground">
                        <span>Status: <strong className="text-foreground">{isBoostTier ? "Unlimited Images" : "Free Plan"}</strong></span>
                        <span className="tabular-nums text-foreground">{isBoostTier ? "Unlimited" : `${dailyImagesUsed} / 3 used`}</span>
                      </div>
                      <div className="w-full bg-black/30 rounded-full h-2.5 overflow-hidden border border-black/10 dark:border-white/5 p-0.5">
                        <motion.div
                          className="bg-primary h-full rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: isBoostTier ? "100%" : `${Math.min(100, (dailyImagesUsed / 3) * 100)}%` }}
                          transition={{ duration: 0.6, ease: "easeOut" }}
                        />
                      </div>
                    </div>

                    {/* Reference Table */}
                    <div className="space-y-1 text-xs">
                      <div className="text-muted-foreground font-semibold px-1 mb-1 text-[11px] uppercase tracking-wider">Models & Workflows</div>
                      <div className="flex justify-between items-center px-1 py-2 border-b border-black/10 dark:border-white/5 text-muted-foreground">
                        <div>
                          <div className="font-medium text-foreground">Arc Imagix</div>
                          <div className="text-[10px]">High-fidelity creative synthesis powered by Arc Matrix™</div>
                        </div>
                        <span className="font-semibold text-foreground">{isBoostTier ? "Unlimited" : "3 free total"}</span>
                      </div>
                      <div className="flex justify-between items-center px-1 py-2 border-b border-black/10 dark:border-white/5 text-muted-foreground">
                        <div>
                          <div className="font-medium text-foreground">Arc Imagix Edit</div>
                          <div className="text-[10px]">Precision visual editing, inpainting, and alteration</div>
                        </div>
                        <span className="font-semibold text-foreground">{isBoostTier ? "Unlimited" : "3 free total"}</span>
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
                </motion.div>
              </div>
            </>
          )}
        </AnimatePresence>,
        document.body
      );
}
