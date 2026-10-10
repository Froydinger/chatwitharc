import { toast } from '@/hooks/use-toast';

const shown = new Set<string>();

/** Show the server's routing notice once for this logical response, including
 * repeated Work completion observations. Generated answer text stays untouched. */
export function showModelSwitchNotice(notice: unknown, responseId: string): string | undefined {
  if (typeof notice !== 'string' || !notice.trim()) return undefined;
  const message = notice.trim();
  const key = `arc-model-switch-notice:${responseId}`;
  let alreadyShown = shown.has(key);
  try { alreadyShown ||= sessionStorage.getItem(key) === 'shown'; } catch { /* Private storage can be unavailable. */ }
  if (!alreadyShown) {
    shown.add(key);
    try { sessionStorage.setItem(key, 'shown'); } catch { /* In-memory deduplication still applies. */ }
    toast({ title: 'Switched to GPT 6 Luna', description: message });
  }
  return message;
}
