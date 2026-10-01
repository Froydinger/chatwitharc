import type { Message } from '@/store/useArcStore';

/** Copy visible conversation only. Never import execution/tool authority or private attachments. */
export function sharedConversationCopy(messages: Message[]): Message[] {
  return messages.filter(message => ['user', 'assistant'].includes(message.role)).map(message => ({
    id: crypto.randomUUID(),
    role: message.role,
    type: 'text' as const,
    content: message.content || (message.imageUrl || message.imageUrls?.length ? '[Image from the shared conversation]' : ''),
    timestamp: new Date(message.timestamp),
  }));
}
