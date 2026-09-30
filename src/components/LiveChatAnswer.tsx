import { useLiveAnswerStore } from '@/store/useLiveAnswerStore';
import { MessageBubble } from '@/components/MessageBubble';
export function LiveChatAnswer({ sessionId, visible }: { sessionId: string | null; visible: boolean }) {
  const answer = useLiveAnswerStore(state => state.answer);
  if (!visible || !answer || answer.sessionId !== sessionId) return null;
  return <div aria-live="off" data-testid="live-chat-answer"><MessageBubble
    message={{ id: `live-${answer.requestId}`, role: 'assistant', type: 'text', content: answer.content, timestamp: answer.timestamp, sourceModel: 'cloud-chat' }}
    isLatestAssistant shouldAnimateTypewriter={false} shouldAnimateReveal={false}
  /></div>;
}
