import type { VirtualFileSystem, AgentAction } from '@/types/ide';

const DEFAULT_SUPABASE_URL = 'https://jxywhodnndagbsmnbnnw.supabase.co';
const DEFAULT_PUBLISHABLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4eXdob2RubmRhZ2JzbW5ibm53Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTkwNjUsImV4cCI6MjA4MTY3NTA2NX0.tmqRRB4jbOOR0FWVsS8zXer_2IZLjzsPb2D3Ozu2bKk';
const AGENT_REQUEST_TIMEOUT_MS = 120000;
const AGENT_INACTIVITY_TIMEOUT_MS = 90000;

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  (PROJECT_ID ? `https://${PROJECT_ID}.supabase.co` : DEFAULT_SUPABASE_URL);
const AGENT_URL = `${SUPABASE_URL}/functions/v1/agent`;

type AgentChatRole = 'user' | 'assistant' | 'system';
type AgentChatMessage = { role: AgentChatRole; content: string };

export interface AgentResult {
  files?: VirtualFileSystem;
  deletions?: string[];
  summary: string;
  actions: AgentAction[];
}

function normalizeRole(role: string): AgentChatRole {
  if (role === 'system' || role === 'assistant') return role;
  return 'user';
}

function normalizeMessages(
  chatHistory: { role: string; content: string }[] | undefined,
  userMessage: string,
): AgentChatMessage[] {
  const history = (chatHistory || [])
    .filter((msg) => typeof msg?.content === 'string' && msg.content.trim().length > 0)
    .map((msg) => ({ role: normalizeRole(msg.role), content: msg.content.trim() }));

  return [...history, { role: 'user', content: userMessage.trim() }];
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
  const messages = normalizeMessages(chatHistory, userMessage);

  const requestController = new AbortController();
  const requestTimeout = setTimeout(() => requestController.abort(), AGENT_REQUEST_TIMEOUT_MS);

  let resp: Response;
  try {
    resp = await fetch(AGENT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken || supabaseKey}`,
      },
      body: JSON.stringify({
        messages,
        currentFiles,
        model,
      }),
      signal: requestController.signal,
    });
  } catch (error) {
    clearTimeout(requestTimeout);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Agent request timed out. Please retry with a shorter prompt.');
    }
    throw error;
  }

  if (!resp.ok || !resp.body) {
    clearTimeout(requestTimeout);
    if (resp.status === 429) throw new Error('Rate limited. Please try again in a moment.');
    if (resp.status === 402) throw new Error('AI credits exhausted. Please add funds.');

    const raw = await resp.text().catch(() => '');
    let parsedError = '';
    try {
      parsedError = JSON.parse(raw)?.error || '';
    } catch {
      parsedError = '';
    }

    throw new Error(parsedError || raw || 'Failed to get response');
  }

  const contentType = resp.headers.get('content-type') || '';
  if (!contentType.includes('text/event-stream')) {
    clearTimeout(requestTimeout);
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
  let deletions: string[] = [];
  let summary = '';
  let parseErrorCount = 0;
  let gotDoneEvent = false;
  let gotFilesEvent = false;
  let lastErrorMessage = '';
  let abortedForInactivity = false;
  let inactivityTimer: ReturnType<typeof setTimeout> | null = null;

  const resetInactivityTimer = () => {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
      abortedForInactivity = true;
      requestController.abort();
    }, AGENT_INACTIVITY_TIMEOUT_MS);
  };

  const processLine = (line: string) => {
    if (line.endsWith('\r')) line = line.slice(0, -1);
    if (line.startsWith(':') || line.trim() === '') return;
    if (!line.startsWith('data: ')) return;

    const jsonStr = line.slice(6).trim();
    if (jsonStr === '[DONE]') return;

    let event: any;
    try {
      event = JSON.parse(jsonStr);
      parseErrorCount = 0;
    } catch (error) {
      parseErrorCount += 1;
      if (parseErrorCount >= 3) {
        throw new Error(`Agent stream parse failure: ${error instanceof Error ? error.message : 'Invalid JSON event'}`);
      }
      return;
    }

    const actionId = crypto.randomUUID();

    switch (event.type) {
      case 'status': {
        const a: AgentAction = { id: actionId, type: 'status', message: event.message, timestamp: Date.now() };
        actions.push(a);
        onAction(a);
        break;
      }
      case 'action': {
        const a: AgentAction = { id: actionId, type: 'action', action: event.action, path: event.path, prompt: event.prompt, timestamp: Date.now() };
        actions.push(a);
        onAction(a);
        break;
      }
      case 'action_complete': {
        const a: AgentAction = { id: actionId, type: 'action_complete', action: event.action, path: event.path, success: event.success, timestamp: Date.now() };
        actions.push(a);
        onAction(a);
        break;
      }
      case 'error': {
        lastErrorMessage = event.message || 'Agent execution failed.';
        const a: AgentAction = { id: actionId, type: 'error', message: lastErrorMessage, timestamp: Date.now() };
        actions.push(a);
        onAction(a);
        break;
      }
      case 'files': {
        files = event.files;
        deletions = Array.isArray(event.deletions) ? event.deletions : [];
        gotFilesEvent = true;
        break;
      }
      case 'done': {
        summary = event.summary || '';
        gotDoneEvent = true;
        break;
      }
      default:
        break;
    }
  };

  try {
    resetInactivityTimer();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      resetInactivityTimer();
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
  } catch (error) {
    if (abortedForInactivity) {
      throw new Error('Agent stopped responding mid-build. Please retry.');
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Agent request timed out. Please retry.');
    }
    throw error;
  } finally {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    clearTimeout(requestTimeout);
  }

  if (lastErrorMessage) {
    throw new Error(lastErrorMessage);
  }

  if (!gotDoneEvent && !gotFilesEvent) {
    throw new Error('Agent stream ended before completion. Please retry.');
  }

  if (!summary) {
    const hasFileChanges = !!files && Object.keys(files).length > 0;
    const hasDeletions = deletions.length > 0;
    summary = hasFileChanges || hasDeletions ? 'Applied file changes.' : 'No changes were needed.';
  }

  let vfs: VirtualFileSystem | undefined;
  if (files && Object.keys(files).length > 0) {
    vfs = {};
    for (const [path, content] of Object.entries(files)) {
      const ext = path.split('.').pop() || 'tsx';
      const languageMap: Record<string, string> = {
        tsx: 'typescript',
        ts: 'typescript',
        jsx: 'javascript',
        js: 'javascript',
        css: 'css',
        json: 'json',
        png: 'plaintext',
        jpg: 'plaintext',
        svg: 'xml',
      };
      vfs[path] = { content, language: languageMap[ext] || 'plaintext' };
    }
  }

  return { files: vfs, deletions, summary, actions };
}
