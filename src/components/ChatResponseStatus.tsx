import { useLiveAnswerStore } from "@/store/useLiveAnswerStore";
import { LiveChatAnswer } from "@/components/LiveChatAnswer";
import { ThinkingIndicator } from "@/components/ThinkingIndicator";

/** First visible answer text replaces the waiting card without a retained exit. */
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
  const hasVisibleAnswer = useLiveAnswerStore(state => !!(showLiveAnswer && state.answer?.sessionId === sessionId && state.answer.content.trim()));
  return <>
    {showThinking && !hasVisibleAnswer && <ThinkingIndicator isLoading={isLoading} isGeneratingImage={false}
      searchingChats={searchingChats} accessingMemory={accessingMemory} searchingWeb={searchingWeb} />}
    <LiveChatAnswer sessionId={sessionId} visible={showLiveAnswer} />
  </>;
}
