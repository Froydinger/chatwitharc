export type ConversationCanvas = { content: string; type: 'writing' | 'code'; language?: string };
type CanvasMessage = { type?: string; canvasContent?: string; codeContent?: string; codeLanguage?: string };
/** Deliberately takes a conversation only, never the global canvas store. */
export function getConversationCanvas(session?: { canvasContent?: string; messages?: CanvasMessage[] } | null): ConversationCanvas | null {
  if (!session) return null;
  const artifact = [...(session.messages ?? [])].reverse().find(message =>
    (message.type === 'canvas' && !!message.canvasContent?.trim()) ||
    (message.type === 'code' && !!message.codeContent?.trim()));
  if (artifact?.type === 'code') return { content: artifact.codeContent!, type: 'code', language: artifact.codeLanguage || 'typescript' };
  const content = session.canvasContent?.trim() ? session.canvasContent : artifact?.canvasContent;
  return content?.trim() ? { content, type: 'writing' } : null;
}

/** Route changes can render before Index hydrates the selected session. */
export function isCurrentConversationRoute(pathname: string, currentId: string | null): boolean {
  if (pathname === '/') return true;
  const match = pathname.match(/^\/chat\/([^/]+)\/?$/);
  if (!match || !currentId) return false;
  try { return decodeURIComponent(match[1]) === currentId; }
  catch { return false; }
}
