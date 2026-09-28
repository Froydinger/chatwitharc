/** Conservative read-only fast path. Ambiguous requests stay with the model. */
export function browserPreflightIntent(text: string, activeHandle?: string):
  { name: 'browserbase_open_live_site' | 'browserbase_act'; arguments: string } | null {
  if (activeHandle && text.trim() === "I'm done controlling the browser. Please check the current page and continue.") {
    return { name: 'browserbase_act', arguments: JSON.stringify({ sessionHandle: activeHandle, operation: { type: 'read_snapshot' } }) };
  }
  if (/\b(?:don't|do not|never|without)\b/i.test(text) || !/\b(?:browse|visit|open|inspect|review|check|head over|go to|look at)\b/i.test(text)) return null;
  const matches = text.match(/(?:https:\/\/|\bwww\.)[^\s<>"']+|\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+\.[a-z]{2,}(?:\/[^\s<>"']*)?|\b[a-z0-9][a-z0-9-]*\.(?:com|org|net|io|dev|app|chat|online)(?:\/[^\s<>"']*)?/gi);
  if (!matches || matches.length !== 1) return null;
  const raw = matches[0].replace(/[.,!?;:)]+$/, '');
  if (!raw.startsWith('https://') && text.includes('http://')) return null;
  return { name: 'browserbase_open_live_site', arguments: JSON.stringify({ targetUrl: raw.startsWith('https://') ? raw : `https://${raw}`, ...(/\b(?:one|1)[ -]minute\b|\b60[ -]seconds?\b/i.test(text) ? { durationSeconds: 60 } : {}) }) };
}
