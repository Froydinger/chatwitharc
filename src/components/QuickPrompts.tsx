import { motion } from "framer-motion";
import { staggerContainerVariants, staggerItemVariants, ANIMATION_DURATION, STAGGER, createHoverVariants, createTapVariants } from "@/utils/animations";

interface QuickPromptsProps {
  quickPrompts: Array<{ label: string; prompt: string }>;
  onTriggerPrompt: (prompt: string) => void;
}

export function QuickPrompts({ quickPrompts, onTriggerPrompt }: QuickPromptsProps) {
  const handlePromptClick = (prompt: string) => {
    // Dispatch event for LandingChatInput to pick up
    window.dispatchEvent(new CustomEvent("quickPromptSelected", { detail: { prompt } }));
    // Also call the callback
    onTriggerPrompt(prompt);
  };

  return (
    <div className="flex flex-col items-center gap-4 px-4">
      {/* Prompt Chips */}
      <motion.div
        className="flex flex-wrap items-center justify-center gap-2 max-w-4xl"
        variants={staggerContainerVariants}
        initial="initial"
        animate="animate"
      >
        {quickPrompts.map((prompt) => (
          <motion.button
            key={prompt.label}
            variants={staggerItemVariants}
            whileHover={createHoverVariants(1.05, 0)}
            whileTap={createTapVariants(0.98)}
            onClick={() => handlePromptClick(prompt.prompt)}
            className="group relative px-4 py-2.5 rounded-full bg-background/40 backdrop-blur-sm border border-border/50 hover:border-primary/40 hover:bg-background/60 transition-all duration-200"
          >
            <span className="text-sm font-medium">{prompt.label}</span>

            {/* Subtle hover glow */}
            <motion.div
              className="absolute inset-0 rounded-full bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
              initial={false}
            />
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
}
