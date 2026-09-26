export type AppBuilderIntent = { action: 'create' | 'edit'; prompt: string };

export interface AppBuilderProjectSummary {
  id: string;
  title: string;
  prompt: string;
  netlify_subdomain?: string | null;
  favicon_label?: string | null;
  updated_at?: string;
}

export type AppBuilderProjectResolution =
  | { kind: 'open'; project: AppBuilderProjectSummary }
  | { kind: 'choose'; projects: AppBuilderProjectSummary[] }
  | { kind: 'not-found' };

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

const APP_MATCH_STOP_WORDS = new Set([
  'a', 'an', 'and', 'app', 'application', 'are', 'can', 'change', 'current', 'could',
  'delete', 'edit', 'existing', 'fix', 'for', 'from', 'i', 'in', 'into', 'it', 'make',
  'me', 'modify', 'my', 'of', 'on', 'one', 'please', 'project', 'remove', 'site', 'that',
  'the', 'this', 'to', 'update', 'website', 'web', 'with', 'you', 'your',
]);

function appMatchTokens(value: string): string[] {
  return [...new Set((value.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .map((word) => word.length > 4 && word.endsWith('s') ? word.slice(0, -1) : word)
    .filter((word) => word.length > 1 && !APP_MATCH_STOP_WORDS.has(word)))];
}

function projectTokenSets(project: AppBuilderProjectSummary) {
  return {
    title: new Set(appMatchTokens(project.title || '')),
    prompt: new Set(appMatchTokens(project.prompt || '')),
    subdomain: new Set(appMatchTokens(project.netlify_subdomain || '')),
    icon: new Set(appMatchTokens(project.favicon_label || '')),
  };
}

/**
 * Resolve an explicit edit request against the user's saved app metadata.
 * Open automatically only when one project is clearly unique; otherwise
 * return matching choices so the user can pick before any code is changed.
 */
export function resolveAppBuilderProject(
  message: string,
  projects: AppBuilderProjectSummary[],
): AppBuilderProjectResolution {
  if (!projects.length) return { kind: 'not-found' };
  if (projects.length === 1) return { kind: 'open', project: projects[0] };

  const queryTokens = appMatchTokens(message);
  if (!queryTokens.length) return { kind: 'choose', projects };

  const ranked = projects.map((project, index) => {
    const fields = projectTokenSets(project);
    const matchedTokens = queryTokens.filter((token) =>
      fields.title.has(token) || fields.subdomain.has(token) || fields.prompt.has(token) || fields.icon.has(token));
    const titleMatches = queryTokens.filter((token) => fields.title.has(token) || fields.subdomain.has(token)).length;
    const score = titleMatches * 4 + queryTokens.filter((token) => fields.prompt.has(token)).length * 2
      + queryTokens.filter((token) => fields.icon.has(token)).length;
    return { project, index, matchedTokens, score, complete: matchedTokens.length === queryTokens.length };
  }).sort((a, b) => b.score - a.score || a.index - b.index);

  const completeMatches = ranked.filter((item) => item.complete);
  if (completeMatches.length === 1) return { kind: 'open', project: completeMatches[0].project };

  const matching = ranked.filter((item) => item.score > 0);
  if (matching.length === 1) return { kind: 'open', project: matching[0].project };

  // A unique, named title match is enough to open. A title shared by multiple
  // apps stays ambiguous even if their descriptions happen to differ slightly.
  const titleMatches = ranked.filter((item) => item.matchedTokens.length > 0
    && queryTokens.some((token) => item.score > 0 && (projectTokenSets(item.project).title.has(token)
      || projectTokenSets(item.project).subdomain.has(token))));
  if (titleMatches.length === 1 && matching[0]?.project.id === titleMatches[0].project.id) {
    return { kind: 'open', project: titleMatches[0].project };
  }

  return {
    kind: 'choose',
    projects: (matching.length ? matching : ranked).map((item) => item.project),
  };
}
