import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Sparkles, MessageCircle, Brain, Image } from "lucide-react";
import { AuthModal } from "./AuthModal";
import { GlassCard } from "./ui/glass-card";

interface GuestSignupPromptProps {
  isOpen: boolean;
  onDismiss: () => void;
  remainingMessages: number;
  isLimitReached: boolean;
}

export function GuestSignupPrompt({ isOpen, onDismiss, remainingMessages, isLimitReached }: GuestSignupPromptProps) {
  const [showAuth, setShowAuth] = useState(false);

  if (!isOpen) return null;

  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={isLimitReached ? undefined : onDismiss}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            onClick={(e) => e.stopPropagation()}
          >
            <GlassCard variant="bubble" glow className="w-full max-w-md p-8">
              <div className="text-center space-y-5">
                {/* Icon */}
                <div className="flex justify-center">
                  <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                    {isLimitReached ? (
                      <Lock className="h-8 w-8 text-primary" />
                    ) : (
                      <Sparkles className="h-8 w-8 text-primary" />
                    )}
                  </div>
                </div>

                {/* Title */}
                <h2 className="text-2xl font-bold text-foreground">
                  {isLimitReached
                    ? "You've used all free chats"
                    : `${remainingMessages} free chat${remainingMessages !== 1 ? 's' : ''} remaining`}
                </h2>

                {/* Description */}
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {isLimitReached
                    ? "Create a free account to continue chatting with Arc and unlock all features."
                    : "Sign up for free to get unlimited chats and unlock all features."}
                </p>

                {/* Features list */}
                <div className="space-y-3 text-left">
                  {[
                    { icon: MessageCircle, text: "Unlimited conversations" },
                    { icon: Brain, text: "Memory & personalized responses" },
                    { icon: Image, text: "Image generation & analysis" },
                  ].map(({ icon: Icon, text }) => (
                    <div key={text} className="flex items-center gap-3 text-sm text-muted-foreground">
                      <Icon className="h-4 w-4 text-primary shrink-0" />
                      <span>{text}</span>
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <button
                  onClick={() => setShowAuth(true)}
                  className="w-full px-6 py-3 rounded-full font-semibold bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:opacity-90 transition-opacity"
                >
                  Sign up free
                </button>

                {!isLimitReached && (
                  <button
                    onClick={onDismiss}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Continue as guest
                  </button>
                )}
              </div>
            </GlassCard>
          </motion.div>
        </motion.div>
      </AnimatePresence>

      <AuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} />
    </>
  );
}
