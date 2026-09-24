import type { AgentAction } from '@/types/ide';
import type { CloudRunAuditItem, CloudRunStatus } from './cloudRuns';

export type AppBuilderChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  images?: string[];
  timestamp: number;
  agentActions?: AgentAction[];
};

export function cloudAuditActions(audit: unknown, runId: string, timestamp: number): AgentAction[] {
  if (!Array.isArray(audit)) return [];
  return (audit as CloudRunAuditItem[]).flatMap((item, index) => {
    if (!item || typeof item.label !== 'string' || !['working', 'completed', 'blocked', 'denied'].includes(item.status)) return [];
    const message = item.status === 'completed' ? item.label : `${item.label}${item.status === 'working' ? '…' : ` (${item.status})`}`;
    if (item.status === 'working') return [{
      id: `${runId}:audit:${index}`, type: 'status', action: item.label, message, timestamp,
    }];
    if (item.status === 'completed') return [{
      id: `${runId}:audit:${index}`, type: 'action_complete', action: item.label, message,
      success: true, timestamp,
    }];
    return [{
      id: `${runId}:audit:${index}`, type: 'error', action: item.label, message,
      success: false, timestamp,
    }];
  });
}

export function cloudAppTranscript(
  rawMessages: unknown,
  options: {
    runId: string;
    status: CloudRunStatus;
    timestamp: number;
    audit?: unknown;
    summary?: string;
  },
): AppBuilderChatMessage[] {
  const raw = Array.isArray(rawMessages) ? rawMessages.slice(-200) : [];
  const history: AppBuilderChatMessage[] = [];
  for (let index = 0; index < raw.length; index++) {
    const value = raw[index];
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const message = value as Record<string, unknown>;
    if (!['user', 'assistant'].includes(String(message.role)) || typeof message.content !== 'string') continue;
    const rawTimestamp = message.timestamp;
    const parsedTimestamp = typeof rawTimestamp === 'number' ? rawTimestamp : Date.parse(String(rawTimestamp));
    const id = typeof message.id === 'string' && message.id ? message.id : `${options.runId}:history:${index}`;
    history.push({
      id,
      role: message.role as 'user' | 'assistant',
      content: message.content,
      timestamp: Number.isFinite(parsedTimestamp) ? parsedTimestamp : options.timestamp,
    });
  }

  const assistantId = `cloud-${options.runId}`;
  const auditActions = cloudAuditActions(options.audit, options.runId, options.timestamp);
  const assistant = history.find(message => message.id === assistantId && message.role === 'assistant');
  if (assistant && auditActions.length) assistant.agentActions = auditActions;

  const terminal = ['completed', 'failed', 'cancelled'].includes(options.status);
  if (!terminal && !assistant) {
    history.push({
      id: assistantId,
      role: 'assistant',
      content: options.status === 'awaiting_input'
        ? 'This build is waiting for your approval. Review the run controls above to continue.'
        : options.status === 'queued' ? 'Your app build is queued…' : 'Arc is building your app…',
      timestamp: options.timestamp,
      agentActions: auditActions,
    });
  } else if (options.status === 'completed' && !assistant && options.summary?.trim()) {
    history.push({ id: assistantId, role: 'assistant', content: options.summary.trim(), timestamp: options.timestamp, agentActions: auditActions });
  } else if (options.status === 'failed' && !assistant) {
    history.push({
      id: assistantId, role: 'assistant', content: 'This build did not finish. Check the run status and reconnect before trying again.',
      timestamp: options.timestamp, agentActions: auditActions,
    });
  } else if (options.status === 'cancelled' && !assistant) {
    history.push({ id: assistantId, role: 'assistant', content: 'This build was cancelled.', timestamp: options.timestamp, agentActions: auditActions });
  }
  return history;
}
