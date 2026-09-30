import { LiveChatAnswer } from "@/components/LiveChatAnswer";
import { ThinkingIndicator } from "@/components/ThinkingIndicator";

/** One activity indicator; a completed reply replaces it without a retained exit. */
export function ChatResponseStatus({ sessionId, showThinking, showLiveAnswer, isLoading,
  searchingChats, accessingMemory, searchingWeb }: {
  sessionId: string | null;
  showThinking: boolean;
  showLiveAnswer: boolean;
  isLoading: boolean;
  searchingChats?: boolean;
  accessingMemory?: boolean;
  searchingWeb?: boolean;
}) {
  return <>
    {showThinking && <ThinkingIndicator isLoading={isLoading} isGeneratingImage={false}
      searchingChats={searchingChats} accessingMemory={accessingMemory} searchingWeb={searchingWeb} />}
    <LiveChatAnswer sessionId={sessionId} visible={showLiveAnswer} />
  </>;
}
