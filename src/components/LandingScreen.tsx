import { useState } from "react";
import { motion } from "framer-motion";
import { LogIn, Zap, Sparkles, Settings, MessageCircle } from "lucide-react";
import { LandingChatInput } from "./LandingChatInput";
import { AuthModal } from "./AuthModal";
import { PrivacyTermsModal } from "./PrivacyTermsModal";
import { GlassButton } from "@/components/ui/glass-button";

export function LandingScreen() {
  const [showAuthModal, setShowAuthModal] = useState(false);

  const handleSendAttempt = (message: string) => {
    // Store the message to be sent after authentication
    sessionStorage.setItem('pending-prompt', message);
    setShowAuthModal(true);
  };

  const features = [
    {
      icon: Zap,
      title: "Lightning Fast",
      description: "Powered by Gemini 2.5 Flash for instant, intelligent responses"
    },
    {
      icon: Settings,
      title: "Customizable",
      description: "Switch between GPT-5, Gemini models, and more in settings"
    },
    {
      icon: MessageCircle,
      title: "Natural Conversations",
      description: "From morning check-ins to late-night ideas without the overwhelm"
    },
    {
      icon: Sparkles,
      title: "Smart & Personal",
      description: "AI that learns your style and keeps up with your pace"
    }
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col relative overflow-hidden pt-12">

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center px-6 relative z-10">
        {/* Top Section with Logo and Title */}
        <div className="flex-1 flex flex-col items-center justify-end pb-8">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1], delay: 0.15 }}
          className="text-center relative"
        >
            {/* Logo positioned to slightly clip behind text */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{
                opacity: 1,
                scale: [1, 1.05, 1]
              }}
              transition={{
                opacity: { duration: 0.3, delay: 0.2 },
                scale: { duration: 10, repeat: Infinity, ease: "easeInOut" }
              }}
              className="flex justify-center mb-[-5px] relative z-0"
            >
              <div className="logo-accent-glow">
                <img
                  src="/arc-logo-ui.png"
                  alt="ArcAI"
                  className="h-16 w-16 sm:h-20 sm:w-20"
                />
              </div>
            </motion.div>

            <div className="relative z-10">
              <motion.h1
                className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground mb-3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
              >
                <span className="font-thin">Arc</span><span className="font-semibold">AI</span>
              </motion.h1>
              <motion.p
                className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
              >
                Ask, Reflect, Create
              </motion.p>
              <motion.p
                className="text-sm text-muted-foreground/70 max-w-xl mx-auto"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
              >
                A relaxing, organized space for both new and experienced AI users
              </motion.p>
            </div>
          </motion.div>
        </div>

        {/* Center Section - Hero Chat Input */}
        <div className="flex-shrink-0 w-full lg:px-32">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <LandingChatInput onSendAttempt={handleSendAttempt} />
          </motion.div>
        </div>

        {/* Bottom Section - Features Grid */}
        <div className="flex-1 flex flex-col items-center justify-start pt-12 pb-8 w-full max-w-5xl">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
            className="w-full"
          >
            {/* Features Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              {features.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <motion.div
                    key={feature.title}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.6 + index * 0.1 }}
                    className="group relative p-5 rounded-2xl backdrop-blur-sm bg-background/40 border border-border/50 hover:border-primary/40 hover:bg-background/60 transition-all duration-300"
                  >
                    <div className="flex items-start gap-4">
                      <div className="shrink-0 p-2.5 rounded-xl bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-foreground mb-1">{feature.title}</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                      </div>
                    </div>

                    {/* Subtle hover effect */}
                    <motion.div
                      className="absolute inset-0 rounded-2xl bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity"
                      initial={false}
                    />
                  </motion.div>
                );
              })}
            </div>

            {/* Login/Sign Up Button */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 1.0 }}
              className="flex justify-center"
            >
              <GlassButton
                variant="ghost"
                onClick={() => setShowAuthModal(true)}
                className="border border-white/20 px-6 py-3"
              >
                <LogIn className="h-4 w-4 mr-2" />
                Sign In / Sign Up
              </GlassButton>
            </motion.div>
          </motion.div>
        </div>
      </div>

      {/* Footer */}
      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.8 }}
        className="py-4 px-6 text-center relative z-10"
      >
        <p className="text-xs text-muted-foreground/60 mb-1">
          Chat Powered by Gemini 2.5 Flash • Image Generation by Gemini 2.5 Flash Image
        </p>
        <p className="text-xs text-muted-foreground/50 mb-2">
          Switch to GPT-5 or other models anytime in settings
        </p>
        <div className="mt-2">
          <PrivacyTermsModal />
        </div>
      </motion.footer>

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />
    </div>
  );
}