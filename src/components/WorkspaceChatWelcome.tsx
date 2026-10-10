import { SmartSuggestions } from '@/components/SmartSuggestions';
import { CyclingGreeting } from '@/components/WelcomeSection';
import { ArcMark } from '@/workspace/WorkspaceChrome';

type Suggestion = { label: string; prompt: string; fullPrompt?: string };

/** Scrollable Workspace presentation; greeting timing and prompt handlers stay live. */
export function WorkspaceChatWelcome({ suggestions, onSelectPrompt, onShowMore }: {
  suggestions: Suggestion[];
  onSelectPrompt: (prompt: string) => void;
  onShowMore: () => void;
}) {
  return (
    <section className="ws-chat-welcome" aria-label="Welcome">
      <ArcMark />
      <h2><CyclingGreeting /></h2>
      <p>Ask. Reflect. Create.</p>
      <div className="ws-welcome-prompts">
        <SmartSuggestions
          suggestions={suggestions}
          onSelectPrompt={onSelectPrompt}
          onShowMore={onShowMore}
          workspaceUI
        />
      </div>
    </section>
  );
}
