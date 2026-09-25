export type AppBuilderIntent = { action: 'create' | 'edit'; prompt: string };

const appNoun = String.raw`(?:app(?:lication)?|web\s*app|website|web\s*site|site|dashboard|project)`;
const editVerb = String.raw`(?:edit|update|change|fix|improve|redesign|add|remove|delete|tweak|adjust|modify|implement|make)`;

/** Route only clear app creation/edit requests; how-to questions stay in Chat. */
export function getAppBuilderIntent(message: string, hasExistingApp = false): AppBuilderIntent | null {
  const text = message.trim();
  if (!text) return null;
  const command = text.match(/^(?:\/(?:app|build)\b|(?:app|build)\/)\s*(.*)$/is);
  if (command) {
    const prompt = command[1].trim();
    const editsExisting = hasExistingApp && new RegExp(`\\b${editVerb}\\b`, 'i').test(prompt)
      && /\b(?:current|existing|this|my)\b/i.test(prompt);
    return { action: editsExisting ? 'edit' : 'create', prompt };
  }
  // Keep how-to and capability questions in Chat even when they mention app
  // creation verbs. Explicit /app and /build commands still route above.
  if (/^(?:how|what|why|when|where|which)\b/i.test(text)
    && /\b(?:build|create|make|design|prototype|scaffold|edit|update|change|fix|improve|redesign|add|remove|delete|tweak|adjust|modify)\b/i.test(text)) {
    return null;
  }
  const isEdit = new RegExp(`\\b${editVerb}\\b[\\s\\S]{0,100}\\b${appNoun}\\b|\\b${appNoun}\\b[\\s\\S]{0,100}\\b${editVerb}\\b`, 'i').test(text);
  if (isEdit) return { action: 'edit', prompt: text };
  if (hasExistingApp && new RegExp(`\\b${editVerb}\\b`, 'i').test(text) && /\b(?:it|this|that)\b/i.test(text)) {
    return { action: 'edit', prompt: text };
  }
  const isCreate = new RegExp(`\\b(?:build|create|make|design|prototype|scaffold|want|need)\\b[\\s\\S]{0,100}\\b${appNoun}\\b|\\b${appNoun}\\b[\\s\\S]{0,100}\\b(?:from scratch|for me)\\b`, 'i').test(text);
  return isCreate ? { action: 'create', prompt: text } : null;
}
