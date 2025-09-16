import { QuickPrompts } from "./QuickPrompts";
import { ThinkingIndicator } from "./ThinkingIndicator";

interface WelcomeSectionProps {
  greeting: string;
  heroAvatar: string;
  quickPrompts: Array<{ label: string; prompt: string }>;
  onTriggerPrompt: (prompt: string) => void;
  isLoading: boolean;
  isGeneratingImage: boolean;
}

export function WelcomeSection({ 
  greeting, 
  heroAvatar, 
  quickPrompts, 
  onTriggerPrompt, 
  isLoading, 
  isGeneratingImage 
}: WelcomeSectionProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Welcome Section */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="mb-8">
          <img
            src={heroAvatar}
            alt="Arc assistant avatar"
            className="assistant-hero-avatar ai-avatar h-20 w-20 mx-auto mb-4 floating-hero"
          />
          <h2 className="text-2xl font-bold text-foreground mb-2">
            {greeting}!
          </h2>
        </div>

        {/* Rolling wall of prompts — 2 rows, ping-pong, slow */}
        <QuickPrompts quickPrompts={quickPrompts} onTriggerPrompt={onTriggerPrompt} />

        <div className="pb-8" />

        <ThinkingIndicator isLoading={isLoading} isGeneratingImage={isGeneratingImage} />
      </div>
    </div>
  );
}