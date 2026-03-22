import type { VirtualFileSystem, AgentAction } from '@/types/ide';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const AGENT_URL = `${SUPABASE_URL}/functions/v1/agent`;

export interface AgentResult {
  files?: VirtualFileSystem;
  deletions?: string[];
  summary: string;
  actions: AgentAction[];
}

export async function sendAgentMessage(
  userMessage: string,
  currentFiles: VirtualFileSystem,
  onAction: (action: AgentAction) => void,
  model?: string,
  authToken?: string
): Promise<AgentResult> {
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const resp = await fetch(AGENT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken || supabaseKey}`,
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: userMessage }],
      currentFiles,
      model,
    }),
  });

  if (!resp.ok || !resp.body) {
    if (resp.status === 429) throw new Error('Rate limited. Please try again in a moment.');
    if (resp.status === 402) throw new Error('AI credits exhausted. Please add funds.');
    const err = await resp.json().catch(() => ({ error: 'Failed to connect to AI' }));
    throw new Error(err.error || 'Failed to get response');
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let textBuffer = '';
  const actions: AgentAction[] = [];
  let files: Record<string, string> | undefined;
  let deletions: string[] | undefined;
  let summary = '';

  const processLine = (line: string) => {
    if (line.endsWith('\r')) line = line.slice(0, -1);
    if (line.startsWith(':') || line.trim() === '') return;
    if (!line.startsWith('data: ')) return;
    const jsonStr = line.slice(6).trim();
    if (jsonStr === '[DONE]') return;

    try {
      const event = JSON.parse(jsonStr);
      const actionId = crypto.randomUUID();

      switch (event.type) {
        case 'status': {
          const a: AgentAction = { id: actionId, type: 'status', message: event.message, timestamp: Date.now() };
          actions.push(a); onAction(a); break;
        }
        case 'action': {
          const a: AgentAction = { id: actionId, type: 'action', action: event.action, path: event.path, prompt: event.prompt, timestamp: Date.now() };
          actions.push(a); onAction(a); break;
        }
        case 'action_complete': {
          const a: AgentAction = { id: actionId, type: 'action_complete', action: event.action, path: event.path, success: event.success, timestamp: Date.now() };
          actions.push(a); onAction(a); break;
        }
        case 'error': {
          const a: AgentAction = { id: actionId, type: 'error', message: event.message, timestamp: Date.now() };
          actions.push(a); onAction(a); break;
        }
        case 'files': {
          files = event.files;
          deletions = event.deletions;
          break;
        }
        case 'done': {
          summary = event.summary || '';
          break;
        }
      }
    } catch { /* incomplete JSON */ }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    textBuffer += decoder.decode(value, { stream: true });
    let newlineIndex: number;
    while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
      const line = textBuffer.slice(0, newlineIndex);
      textBuffer = textBuffer.slice(newlineIndex + 1);
      processLine(line);
    }
  }

  if (textBuffer.trim()) {
    for (const raw of textBuffer.split('\n')) {
      if (raw.trim()) processLine(raw);
    }
  }

  // If stream ended with an error action but no summary, throw so the caller
  // shows the real error instead of the silent "Done!" fallback.
  if (!summary) {
    const errAction = actions.find(a => a.type === 'error') as any;
    if (errAction?.message) {
      throw new Error(errAction.message);
    }
  }

  let vfs: VirtualFileSystem | undefined;
  if (files && Object.keys(files).length > 0) {
    vfs = {};
    for (const [path, content] of Object.entries(files)) {
      const ext = path.split('.').pop() || 'tsx';
      const languageMap: Record<string, string> = {
        tsx: 'typescript', ts: 'typescript', jsx: 'javascript',
        js: 'javascript', css: 'css', json: 'json', png: 'plaintext',
        jpg: 'plaintext', svg: 'xml',
      };
      vfs[path] = { content, language: languageMap[ext] || 'plaintext' };
    }
  }

  return { files: vfs, deletions, summary, actions };
}
