import { motion, AnimatePresence } from "framer-motion";
import { Crown, MessageCircle, Mic, Headphones, Sparkles, X, Check } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { useSubscription } from "@/hooks/useSubscription";

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  userName?: string;
}

export function UpgradeModal({ isOpen, onClose, userName }: UpgradeModalProps) {
  const subscription = useSubscription();

  const handleUpgrade = async () => {
    await subscription.openCheckout();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md"
          >
            <GlassCard variant="bubble" glow className="p-8 relative overflow-hidden border border-cyan-500/30 animate-[neon-pulse_2s_ease-in-out_infinite]">
              {/* Gradient accent */}
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-cyan-500 to-purple-500" />
              
              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-1.5 rounded-full bg-white/5 hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="space-y-6">
                {/* Header */}
                <div className="text-center space-y-2">
                  <motion.div
                    animate={{ rotate: [0, 5, -5, 0] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                    className="flex justify-center"
                  >
                    <div className="p-3 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/20">
                      <Crown className="w-8 h-8 text-cyan-400" />
                    </div>
                  </motion.div>
                  <h2 className="text-xl font-bold text-foreground">
                    {userName ? `Welcome, ${userName}!` : "Welcome to ArcAi!"}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Unlock the full ArcAi experience with Pro
                  </p>
                </div>

                {/* Benefits */}
                <ul className="space-y-3">
                  <li className="flex items-center gap-3 text-sm text-foreground">
                    <div className="p-1 rounded-full bg-cyan-500/10">
                      <MessageCircle className="w-3.5 h-3.5 text-cyan-400" />
                    </div>
                    <span><strong>Unlimited</strong> messages — no daily caps</span>
                  </li>
                  <li className="flex items-center gap-3 text-sm text-foreground">
                    <div className="p-1 rounded-full bg-cyan-500/10">
                      <Mic className="w-3.5 h-3.5 text-cyan-400" />
                    </div>
                    <span><strong>Unlimited</strong> voice sessions</span>
                  </li>
                  <li className="flex items-center gap-3 text-sm text-foreground">
                    <div className="p-1 rounded-full bg-cyan-500/10">
                      <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    </div>
                    <span>Switch between AI models</span>
                  </li>
                  <li className="flex items-center gap-3 text-sm text-foreground">
                    <div className="p-1 rounded-full bg-cyan-500/10">
                      <Headphones className="w-3.5 h-3.5 text-cyan-400" />
                    </div>
                    <span>Built-in music player</span>
                  </li>
                </ul>

                {/* Price */}
                <div className="text-center">
                  <span className="text-3xl font-bold text-foreground">$8</span>
                  <span className="text-muted-foreground text-sm"> /month</span>
                </div>

                {/* Buttons */}
                <div className="space-y-3">
                  <button
                    onClick={handleUpgrade}
                    className="w-full px-6 py-3.5 rounded-full font-semibold bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(6,182,212,0.3)]"
                  >
                    <Crown className="w-4 h-4" />
                    Upgrade to Pro
                  </button>
                  <button
                    onClick={onClose}
                    className="w-full px-6 py-2.5 rounded-full text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Maybe later — continue free
                  </button>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
