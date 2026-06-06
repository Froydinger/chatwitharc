/**
 * Detect and extract @persona mentions from user input.
 * Format: @PersonaName (name is case-insensitive, supports spaces)
 */
export function extractPersonaMention(text: string): string | null {
  const match = text.match(/@([\w\s]+?)(?:\s|$)/);
  if (!match) return null;
  return match[1].trim();
}

/**
 * Check if text starts with a @persona mention.
 * If so, return the mention and the remaining text.
 */
export function parsePersonaMentionPrefix(text: string): { personaName: string; remaining: string } | null {
  const trimmed = text.trim();
  const match = trimmed.match(/^@([\w\s]+?)\s+(.*?)$/);
  if (!match) return null;
  return {
    personaName: match[1].trim(),
    remaining: match[2],
  };
}

/**
 * Strip @mention from the beginning of text.
 */
export function stripPersonaMention(text: string): string {
  return text.replace(/^@[\w\s]+?\s+/, '').trim();
}
