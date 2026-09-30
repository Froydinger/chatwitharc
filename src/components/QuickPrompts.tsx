import { Transition } from "@/components/transitions/Transition";

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
      <div className="flex flex-wrap items-center justify-center gap-2 max-w-4xl">
        {quickPrompts.map((prompt, index) => (
          <Transition key={prompt.label} preset="panel" delay={index * 0.04}><button
            onClick={() => handlePromptClick(prompt.prompt)}
            className="arc-prompt-chip group relative px-4 py-2.5 rounded-full outline-shimmer hover:ring-1 hover:ring-primary/50"
          >
            <span className="text-sm font-medium">{prompt.label}</span>

            {/* Subtle hover glow */}
            <div
              className="absolute inset-0 rounded-full bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
            />
          </button></Transition>
        ))}
      </div>
    </div>
  );
}
