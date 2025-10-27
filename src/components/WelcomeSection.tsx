import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { ThinkingIndicator } from "@/components/ThinkingIndicator";
import { SmartSuggestions } from "@/components/SmartSuggestions";
import { PromptLibrary } from "@/components/PromptLibrary";
import { selectSmartPrompts, QuickPrompt } from "@/utils/smartPrompts";
import { Profile } from "@/hooks/useProfile";
import { ChatSession } from "@/store/useArcStore";

interface WelcomeSectionProps {
  greeting: string;
  heroAvatar: string;
  quickPrompts: { label: string; prompt: string }[];
  onTriggerPrompt: (prompt: string) => void;
  profile: Profile | null;
  chatSessions: ChatSession[];
  isLoading?: boolean;
  isGeneratingImage?: boolean;
}

export function WelcomeSection({
  greeting,
  heroAvatar,
  quickPrompts,
  onTriggerPrompt,
  profile,
  chatSessions,
  isLoading = false,
  isGeneratingImage = false,
}: WelcomeSectionProps) {
  const [showLibrary, setShowLibrary] = useState(false);

  // Convert prompts to categorized format
  const categorizedPrompts: QuickPrompt[] = useMemo(() => {
    return quickPrompts.map((p, index) => ({
      ...p,
      category: 
        index < 6 ? 'chat' :
        index < 12 ? 'create' :
        index < 18 ? 'write' :
        'code'
    }));
  }, [quickPrompts]);

  // Smart prompt selection
  const smartSuggestions = useMemo(() => {
    return selectSmartPrompts(categorizedPrompts, profile, chatSessions, 3);
  }, [categorizedPrompts, profile, chatSessions]);

  return (
    <>
      <div className="flex flex-col items-center justify-start min-h-full py-12 px-4 space-y-12">
        {/* Hero Section */}
        <motion.div
          className="flex flex-col items-center gap-6 text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          {/* Avatar */}
          <motion.div
            className="relative"
            animate={{
              y: [0, -8, 0],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <img src={heroAvatar} alt="Arc" className="h-24 w-24 rounded-full" />
            <motion.div
              className="absolute -inset-1 bg-primary/30 rounded-full blur-xl"
              animate={{
                scale: [1, 1.1, 1],
                opacity: [0.3, 0.5, 0.3],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          </motion.div>

          {/* Greeting */}
          <motion.h2
            className="text-3xl font-semibold"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            {greeting}
          </motion.h2>

          <motion.p
            className="text-muted-foreground text-lg max-w-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            What would you like to explore today?
          </motion.p>
        </motion.div>

        {/* Smart Suggestions */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="w-full"
        >
          <SmartSuggestions
            suggestions={smartSuggestions}
            onSelectPrompt={onTriggerPrompt}
            onShowMore={() => setShowLibrary(true)}
          />
        </motion.div>

        {/* Thinking Indicator */}
        {(isLoading || isGeneratingImage) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-8"
          >
            <ThinkingIndicator isLoading={isLoading} isGeneratingImage={isGeneratingImage} />
          </motion.div>
        )}
      </div>

      {/* Prompt Library Drawer */}
      <PromptLibrary
        isOpen={showLibrary}
        onClose={() => setShowLibrary(false)}
        prompts={quickPrompts}
        onSelectPrompt={onTriggerPrompt}
      />
    </>
  );
}
