import type { VirtualFileSystem, AgentAction } from '@/types/ide';

const DEFAULT_SUPABASE_URL = 'https://jxywhodnndagbsmnbnnw.supabase.co';
const DEFAULT_PUBLISHABLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4eXdob2RubmRhZ2JzbW5ibm53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTkwNjUsImV4cCI6MjA4MTY3NTA2NX0.tmqRRB4jbOOR0FWVsS8zXer_2IZLjzsPb2D3Ozu2bKk';

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  (PROJECT_ID ? `https://${PROJECT_ID}.supabase.co` : DEFAULT_SUPABASE_URL);
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
  authToken?: string,
  chatHistory?: { role: string; content: string }[]
): Promise<AgentResult> {
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || DEFAULT_PUBLISHABLE_KEY;

  // Build messages array: include chat history for multi-turn context
  const messages = chatHistory && chatHistory.length > 0
    ? [...chatHistory, { role: 'user', content: userMessage }]
    : [{ role: 'user', content: userMessage }];

  const resp = await fetch(AGENT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken || supabaseKey}`,
    },
    body: JSON.stringify({
      messages,
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

  const contentType = resp.headers.get('content-type') || '';
  if (!contentType.includes('text/event-stream')) {
    const body = await resp.text().catch(() => '');
    const looksLikeHtml = body.trim().startsWith('<!DOCTYPE html') || body.trim().startsWith('<html');
    throw new Error(
      looksLikeHtml
        ? 'Agent request hit the app shell instead of the backend function. Please retry.'
        : `Unexpected agent response type: ${contentType || 'unknown'}`
    );
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
  // shows the real error instead of a silent fallback.
  if (!summary) {
    const errAction = actions.find(a => a.type === 'error') as any;
    if (errAction?.message) {
      throw new Error(errAction.message);
    }

    const hasFileChanges = !!files && Object.keys(files).length > 0;
    const hasDeletions = !!deletions && deletions.length > 0;
    if (!hasFileChanges && !hasDeletions) {
      throw new Error('Agent returned no file changes. Please retry with a clearer build request.');
    }

    summary = 'Applied file changes.';
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
