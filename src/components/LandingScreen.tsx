import { useState } from "react";
import { motion } from "framer-motion";
import { LogIn } from "lucide-react";
import { LandingChatInput } from "./LandingChatInput";
import { QuickPrompts } from "./QuickPrompts";
import { AuthModal } from "./AuthModal";
import { PrivacyTermsModal } from "./PrivacyTermsModal";
import { GlassButton } from "@/components/ui/glass-button";

export function LandingScreen() {
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Quick Prompts - same as in MobileChatApp for consistency
  const quickPrompts = [
    { label: "🎯 Focus",     prompt: "Help me set up a focused work session. Guide me through planning a productive 25-minute sprint." },
    { label: "🎨 Create",    prompt: "I need creative inspiration. Give me an interesting creative idea I can work on today." },
    { label: "💭 Check-in",  prompt: "Help me do a quick wellness check. Ask me about my mood and energy level, then give me personalized advice." },
    { label: "💬 Chat",      prompt: "I want to have a casual conversation. Ask me about my day and let's chat like friends." },
    { label: "🤝 Advice",    prompt: "I have a situation I need advice on. Help me think through a decision or challenge I'm facing." },
    { label: "🙏 Gratitude", prompt: "Lead me through a quick gratitude exercise to help me appreciate the good things in my life." },
    { label: "📚 Learn",     prompt: "Help me understand something new. I want to learn about a topic that interests me." },
    { label: "📋 Plan",      prompt: "Help me organize my day or week. Guide me through creating a structured plan for my goals." },
    { label: "🪞 Reflect",   prompt: "Lead me through a guided reflection session about my recent experiences and growth." },
    { label: "⚡ Motivate",  prompt: "I need encouragement and motivation. Help me feel inspired and energized." },
    { label: "🤔 Decide",    prompt: "Help me make a decision. I have options to consider and need guidance on choosing the best path." },
    { label: "🧘 Calm",      prompt: "I need stress relief and calming support. Guide me through a relaxation or mindfulness exercise." }
  ];

  const handleSendAttempt = (message: string) => {
    // User tried to send a message, show auth modal
    setShowAuthModal(true);
  };

  const handleTriggerPrompt = (prompt: string) => {
    // User selected a quick prompt, show auth modal
    setShowAuthModal(true);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col relative overflow-hidden">

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center px-6 relative z-10">
        {/* Top Section with Logo and Title */}
        <div className="flex-1 flex flex-col items-center justify-end pb-8">
          <motion.div 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <motion.div
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="flex justify-center mb-6"
            >
              <img 
                src="/lovable-uploads/72a60af7-4760-4f2e-9000-1ca90800ae61.png" 
                alt="ArcAI" 
                className="h-16 w-16 sm:h-20 sm:w-20 avatar-filled-eyes" 
              />
            </motion.div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground mb-4">
              <span className="font-thin">Arc</span><span className="font-semibold">AI</span>
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto">
              Ask, Reflect, Create
            </p>
          </motion.div>
        </div>

        {/* Center Section - Hero Chat Input */}
        <div className="flex-shrink-0 w-full lg:px-32">
          <motion.div 
            initial={{ opacity: 0, y: 30 }} 
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <LandingChatInput onSendAttempt={handleSendAttempt} />
          </motion.div>
        </div>

        {/* Bottom Section - Quick Prompts */}
        <div className="flex-1 flex flex-col items-center justify-start pt-8">
          <motion.div 
            initial={{ opacity: 0, y: 40 }} 
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="w-full max-w-6xl mb-8"
          >
            <QuickPrompts quickPrompts={quickPrompts} onTriggerPrompt={handleTriggerPrompt} />
          </motion.div>

          {/* Login/Sign Up Button */}
          <motion.div
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
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
        </div>
      </div>

      {/* Footer */}
      <motion.footer 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.8 }}
        className="py-4 px-6 text-center relative z-10"
      >
        <p className="text-xs text-muted-foreground/60">
          Start your conversation with ArcAI
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