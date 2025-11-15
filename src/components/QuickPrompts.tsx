import { motion } from "framer-motion";

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
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex flex-col items-center gap-4 px-4"
    >
      {/* Prompt Chips */}
      <div className="flex flex-wrap items-center justify-center gap-2 max-w-4xl">
        {quickPrompts.map((prompt, index) => (
          <motion.button
            key={prompt.label}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, delay: index * 0.02, ease: "easeOut" }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handlePromptClick(prompt.prompt)}
            className="group relative px-4 py-2.5 rounded-full bg-background/40 backdrop-blur-sm border border-border/50 hover:border-primary/40 hover:bg-background/60 transition-all duration-300"
          >
            <span className="text-sm font-medium">{prompt.label}</span>

            {/* Subtle hover glow */}
            <motion.div
              className="absolute inset-0 rounded-full bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity"
              initial={false}
            />
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}
