/** Provider ids and bounded reasoning policy shared by the picker and servers.
 * This module is pure: callers must supply server-verified authorization. */
export const ARC_LUNA = 'gpt-6-luna';
export const ARC_SOL = 'gpt-6.1-sol';
export const ARC_ASTRA = 'gpt-6-astra';
export type ArcTextModel = typeof ARC_LUNA | typeof ARC_SOL | typeof ARC_ASTRA;
export type ArcModelSelection = 'auto' | ArcTextModel;
export type ArcReasoningEffort = 'none' | 'low' | 'medium' | 'high';
export type ArcModelTask = 'chat' | 'write' | 'code' | 'search' | 'analysis' | 'file';
export type ArcModelRoute = { model: ArcTextModel; effort: ArcReasoningEffort; selection: ArcModelSelection; task: ArcModelTask };

export class ArcModelAccessError extends Error {
  constructor(message: string, public status = 403) { super(message); this.name = 'ArcModelAccessError'; }
}

/** Retired provider/mode/effort preferences migrate to Auto. Historical response
 * metadata is never passed through this function and keeps its original label. */
export function normalizeArcModelSelection(value: unknown): ArcModelSelection {
  return value === ARC_LUNA || value === ARC_SOL || value === ARC_ASTRA ? value : 'auto';
}

export function arcRequestSelection(request: Record<string, unknown>): ArcModelSelection {
  // New selection takes precedence over compatibility hints. Never infer access
  // from a user profile, requested effort, a model name in text, or hasBoost.
  if (request.modelSelection !== undefined) return normalizeArcModelSelection(request.modelSelection);
  if (request.reasoningSelection !== undefined) return normalizeArcModelSelection(request.reasoningSelection);
  return normalizeArcModelSelection(request.model);
}

/** Installed clients predating modelSelection also send voice reminders through
 * Chat. Preserve their Luna-only contract without depending on the new ledger.
 * A canonical premium selector still enters normal authorization/accounting;
 * a retired selector can only narrow a conflicting raw model hint to Luna. */
export function legacyArcChatRoute(request: Record<string, unknown>): ArcModelRoute | null {
  if (request.modelSelection !== undefined) return null;
  const oldSelection = request.reasoningSelection;
  if (oldSelection !== undefined && (typeof oldSelection !== 'string'
      || !['auto', 'none', 'low', 'medium', 'high', 'think', 'flash', 'flynn'].includes(oldSelection))) return null;
  if (oldSelection === undefined && (request.model === ARC_SOL || request.model === ARC_ASTRA)) return null;
  const oldEffort = request.reasoningEffort;
  const effort: ArcReasoningEffort = request.collabChat === true || oldSelection === 'flash' || oldSelection === 'flynn' ? 'low'
    : oldEffort === 'none' || oldEffort === 'low' || oldEffort === 'medium' || oldEffort === 'high' ? oldEffort : 'medium';
  return { model: ARC_LUNA, effort, selection: ARC_LUNA, task: arcRequestTask(request) };
}

export function arcRequestText(request: Record<string, unknown>): string {
  const messages = Array.isArray(request.messages) ? request.messages : [];
  const last = [...messages].reverse().find(value => value && typeof value === 'object'
    && (value as Record<string, unknown>).role === 'user') as Record<string, unknown> | undefined;
  if (typeof last?.content === 'string') return last.content;
  if (Array.isArray(last?.content)) return last.content.map(part => part && typeof part === 'object'
    && typeof part.text === 'string' ? part.text : '').join('\n');
  return typeof request.prompt === 'string' ? request.prompt : '';
}

export function arcRequestTask(request: Record<string, unknown>): ArcModelTask {
  if (request.forceCode === true || request.forceGit === true || request.buildApp === true) return 'code';
  if (request.forceCanvas === true) return 'write';
  if (request.forceWebSearch === true) return 'search';
  const text = arcRequestText(request).trim();
  if (/^(?:\/(?:code|git|app|build)|(?:code|git|app|build)\/)\b/i.test(text)
    || /\b(?:debug|refactor|implement|code review|write (?:a |an )?(?:script|function|program)|build (?:a |an )?(?:app|website|component))\b/i.test(text)) return 'code';
  if (/^(?:\/(?:write|canvas)|(?:write|canvas)\/)/i.test(text)
    || /\b(?:write|draft|rewrite|compose|edit|proofread|polish)\b[\s\S]{0,80}\b(?:email|message|letter|essay|article|post|copy|paragraph|story|report|document|proposal|memo|resume|résumé|bio|outline|poem|speech|script)\b/i.test(text)) return 'write';
  if (/^(?:\/search|search\/)/i.test(text)
    || /\b(?:search (?:the )?(?:web|internet)|look (?:it |this |that )?up|browse (?:the )?(?:web|internet))\b/i.test(text)) return 'search';
  if (/\b(?:analy[sz]e|compare|evaluate|prove|calculate|solve|derive|trade[- ]offs?|reason through)\b/i.test(text)) return 'analysis';
  return 'chat';
}

export function arcRequestComplexity(request: Record<string, unknown>): 0 | 1 | 2 | 3 {
  const text = arcRequestText(request).trim();
  if (text.length > 2000 || /\b(?:deep[- ](?:think|reason)|comprehensive|exhaustive|rigorous|multi[- ]step)\b/i.test(text)) return 3;
  if (text.length > 500 || /\b(?:analy[sz]e|compare|evaluate|debug|refactor|architect|prove|optimi[sz]e|trade[- ]offs?)\b/i.test(text)) return 2;
  return text.length > 150 ? 1 : 0;
}

export function resolveArcModelRoute(options: {
  selection: ArcModelSelection; task: ArcModelTask; complexity?: 0 | 1 | 2 | 3;
  hasBoost?: boolean; isAdmin?: boolean;
}): ArcModelRoute {
  const { selection, task } = options;
  const complexity = options.complexity ?? 0;
  if (selection === ARC_ASTRA && options.isAdmin !== true && options.hasBoost !== true) {
    throw new ArcModelAccessError('GPT 6 Astra requires ArcAI Boost.');
  }
  const model = selection === 'auto'
    ? (['write', 'code', 'search', 'file'].includes(task) ? ARC_SOL : ARC_LUNA)
    : selection;
  // "Light" is presentation wording only. The provider's actual enum is low.
  // Sol and Astra do not support none. Astra is deliberately capped at medium.
  const effort: ArcReasoningEffort = model === ARC_ASTRA
    ? (task === 'chat' || complexity < 2 ? 'low' : 'medium')
    : model === ARC_SOL
      ? (task === 'chat' ? 'low' : complexity >= 3 ? 'high' : complexity >= 1 ? 'medium' : 'low')
      : complexity >= 3 ? 'high' : complexity >= 2 ? 'medium' : complexity === 1 || task !== 'chat' ? 'low' : 'none';
  return { model, effort, selection, task };
}

/** Validate provider payloads independently of routing so a resumed run or a
 * future caller cannot submit an invalid effort, even after a policy change. */
export function arcProviderEffort(model: ArcTextModel, effort: ArcReasoningEffort): ArcReasoningEffort {
  if (model === ARC_ASTRA) return effort === 'medium' || effort === 'high' ? 'medium' : 'low';
  if (model === ARC_SOL && effort === 'none') return 'low';
  return effort;
}
