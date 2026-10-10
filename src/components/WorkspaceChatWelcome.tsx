import { Transition } from '@/components/transitions/Transition';
import { SmartSuggestions } from '@/components/SmartSuggestions';
import { CyclingGreeting } from '@/components/WelcomeSection';

type Suggestion = { label: string; prompt: string; fullPrompt?: string };

/** Workspace-only welcome cluster; the original greeting and prompt actions stay live. */
export function WorkspaceChatWelcome({ suggestions, onSelectPrompt, onShowMore }: {
  suggestions: Suggestion[];
  onSelectPrompt: (prompt: string) => void;
  onShowMore: () => void;
}) {
  return (
    <section className="ws-chat-welcome" aria-label="Welcome">
      <Transition preset="fade" delay={0.1}>
        <div className="ws-live-greeting">
          <div className="text-3xl sm:text-4xl lg:text-5xl font-semibold text-center">
            <span className="relative inline-block"><CyclingGreeting /></span>
          </div>
        </div>
      </Transition>
      <SmartSuggestions
        suggestions={suggestions}
        onSelectPrompt={onSelectPrompt}
        onShowMore={onShowMore}
        workspaceUI
      />
    </section>
  );
}
