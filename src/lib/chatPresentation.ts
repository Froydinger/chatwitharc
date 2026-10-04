import type { Message } from '@/store/useArcStore';
import type { CloudRunLifecycleEntry } from '@/services/cloudRunLifecycle';

export function shouldShowSearchCard(message: Pick<Message, 'role' | 'type' | 'voiceSearchResult' | 'memoryAction' | 'webSources'>): boolean {
  return message.role === 'assistant' && message.type === 'text' && (
    message.voiceSearchResult === true || message.memoryAction?.type === 'web_searched' ||
    (message.webSources?.length ?? 0) > 0
  );
}

export function hasSessionCloudProgress(entries: CloudRunLifecycleEntry[], sessionId: string | null): boolean {
  return sessionId !== null && entries.some(entry => entry.sessionId === sessionId && (!entry.run ||
    ['queued', 'running', 'awaiting_input'].includes(entry.run.status)
  ));
}
