/**
 * Shared routing signal for requests that need a saved multi-file project.
 * Keep this deliberately conservative: a request must ask to create/build a
 * website or app and contain a clear multi-page/full-site signal.
 */
export function isMultiPageBuildRequest(message: string): boolean {
  const text = typeof message === 'string' ? message.trim().toLowerCase() : '';
  if (!text) return false;

  // Questions about how to build something should stay conversational.
  if (/^(?:can\s+you\s+)?(?:explain|tell\s+me\s+about|how\s+(?:do\s+i|can\s+i|to)|what\s+is|should\s+i)\b/.test(text)) return false;

  if (/^(?:can you\s+)?(?:write|draft|explain|summarize)\b/.test(text)) return false;
  if (/\b(?:logo|icon|image|picture|mockup|copy|policy|policies|article|list|guide|tutorial)\s+(?:for|of|about)\b/.test(text)
    && !/\b(?:and|then|also)\s+(?:build|create|make|develop)\b/.test(text)) return false;
  const asksToBuild = /\b(build|create|make|design|develop|generate|launch|produce|turn\s+.+\s+into)\b/.test(text)
    && /\b(app|application|website|web\s*app|webapp|site|portal|dashboard|platform|storefront)\b/.test(text);
  if (!asksToBuild) return false;

  return /\bmulti[- ]pages?\b/.test(text)
    || /\b(?:multiple|several|two|three|four|five|six|seven|eight|nine|ten)\s+pages?\b/.test(text)
    || /\b(?:full|complete|entire|whole)\s+(?:website|site|web\s*app|application)\b/.test(text)
    || /\b(?:website|site|web\s*app|application)\b[^.!?\n]{0,100}\b(?:pages?|routes?|navigation|policies|about|contact|shop|journal|checkout)\b/.test(text)
    || /\b(?:home|about|contact|services|shop|products?|pricing|faq|policies|privacy|terms|journal|blog)\s+pages?\b/.test(text);
}

export function latestUserMessage(request: Record<string, unknown>): string {
  const messages = Array.isArray(request.messages) ? request.messages : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || typeof message !== 'object' || Array.isArray(message)) continue;
    const row = message as Record<string, unknown>;
    if (row.role === 'user' && typeof row.content === 'string') return row.content;
  }
  return '';
}
