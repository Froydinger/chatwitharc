/** Shared product catalog. Provider availability must be supplied by the caller;
 * listing a model here never enables an unfinished transport or grants access. */
export const ARC_TEXT_MODELS = [
  { id: 'gpt-6-luna', name: 'GPT 6 Luna', family: 'gpt', boostOnly: false },
  { id: 'gpt-6-sol', name: 'GPT 6 Sol', family: 'gpt', boostOnly: true },
  { id: 'gpt-6.1-sol', name: 'GPT 6.1 Sol', family: 'gpt', boostOnly: true },
  { id: 'gpt-6-astra', name: 'GPT 6 Astra', family: 'gpt', boostOnly: true },
  { id: 'gemini-3.8-flash', name: 'Gemini Flash 3.8', family: 'gemini', boostOnly: false, freeDailyLimit: 20 },
] as const;
export type ArcTextModelId = typeof ARC_TEXT_MODELS[number]['id'];
export const ARC_CHAT_MODES = [
  { id: 'think', name: 'Arc Think', attribution: 'Powered by GPT 6 & 6.1' },
  { id: 'flash', name: 'Arc Flash', attribution: 'Powered by Gemini Flash' },
] as const;
export type ArcChatMode = typeof ARC_CHAT_MODES[number]['id'];
export function normalizeArcChatMode(selection: string): ArcChatMode {
  return ['flash', 'flynn', 'gemini-3.8-flash'].includes(selection) ? 'flash' : 'think';
}
export function arcResponseMode(model: string): ArcChatMode {
  return model === 'gemini-3.8-flash' ? 'flash' : 'think';
}
export const ARC_FREE_FLASH_DAILY_LIMIT = 20;
export const ARC_FREE_IMAGE_DAILY_CREDITS = 8;
export const ARC_IMAGE_MODELS = [
  { id: 'gpt-image-2.5-flare', name: 'GPT Image 2.5 Flare', creditsPerImage: 1 },
  { id: 'gpt-image-2.5-sunburst', name: 'GPT Image 2.5 Sunburst', creditsPerImage: 1 },
  { id: 'gemini-3.1-flash-image', name: 'Nano Banana 2', creditsPerImage: 2 },
] as const;
/** Public plan wording deliberately does not expose numeric quotas. */
export function arcUsageLabel(hasBoost: boolean): 'Less usage' | 'Unlimited usage' {
  return hasBoost ? 'Unlimited usage' : 'Less usage';
}
export function arcUsagePercent(used: number, limit: number): number {
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) throw new Error('Invalid usage meter.');
  return Math.min(100, Math.max(0, Math.round(used / limit * 100)));
}

/** Price completed output images, not calls, assistant messages or tool rounds. */
export function arcImageCreditCost(modelId: string, imageCount: number): number {
  const model = ARC_IMAGE_MODELS.find(item => item.id === modelId);
  if (!model || !Number.isInteger(imageCount) || imageCount < 1 || imageCount > 3) throw new Error('Invalid image credit request.');
  return model.creditsPerImage * imageCount;
}

export const ARC_VOICE_MODEL = { id: 'gpt-live-1', name: 'GPT Live 1' } as const;

export function arcTextModel(id: string) {
  return ARC_TEXT_MODELS.find(model => model.id === id);
}

/** Compatibility for existing saved selections, not an authorization decision. */
export function normalizeArcTextSelection(selection: string): ArcTextModelId | 'auto' {
  if (selection === 'auto') return 'auto';
  if (arcTextModel(selection)) return selection as ArcTextModelId;
  if (selection === 'high' || selection === 'river') return 'gpt-6.1-sol';
  if (selection === 'flynn') return 'gemini-3.8-flash';
  // Ava/Maya/retired flash preserve their existing Luna migration.
  return 'gpt-6-luna';
}

/** One policy used by client labels and server admission. Limited access still
 * requires an atomic quota reservation before any paid provider request. */
export function arcTextAccess(id: string, hasBoost: boolean):
  { kind: 'unavailable' | 'boost-required' | 'included' } | { kind: 'daily-limit'; limit: number } {
  const model = arcTextModel(id);
  if (!model) return { kind: 'unavailable' };
  if (model.boostOnly && !hasBoost) return { kind: 'boost-required' };
  if (!hasBoost && 'freeDailyLimit' in model) return { kind: 'daily-limit', limit: model.freeDailyLimit };
  return { kind: 'included' };
}

/** Pass only models whose actual provider paths are deployed. Never infer the
 * current response model from a picker, old branding or user-editable profile. */
export function arcModelContext(options: {
  selectedModel: string;
  hasBoost: boolean;
  availableTextModels: readonly string[];
  availableImageModels: readonly string[];
  voiceModel?: string;
}): string {
  const selected = arcTextModel(options.selectedModel);
  if (!selected || !options.availableTextModels.includes(selected.id)) throw new Error('Selected model is not available.');
  const text = ARC_TEXT_MODELS.filter(model => options.availableTextModels.includes(model.id));
  const images = ARC_IMAGE_MODELS.filter(model => options.availableImageModels.includes(model.id));
  const descriptions = text.map(model => {
    const access = arcTextAccess(model.id, options.hasBoost);
    return `${model.name}: ${access.kind === 'boost-required' ? 'requires Boost' : access.kind === 'daily-limit' ? `${access.limit} free messages per UTC day; Boost removes this free limit` : 'included in this account plan'}`;
  });
  return [
    'ARC MODEL AND PLAN CONTEXT — authoritative application configuration',
    'You are Arc. Arc Matrix is the orchestrator and Auto mode, not a provider model.',
    'The chat picker has two choices: Arc Think (Auto orchestration, Powered by GPT 6 & 6.1) and Arc Flash (Powered by Gemini Flash).',
    'Free accounts have unlimited Arc Think and 20 Arc Flash messages per UTC day. Auto may use Flash, consuming the same allowance; once it is exhausted Auto uses Luna. Explicit Flash stops at the allowance with an upgrade/quota message.',
    'Boost removes these free chat quotas. Paid GPT models are restricted to Boost. Count user messages sent to Flash, including Auto-routed user messages; never count assistant responses or tool rounds. Voice limits and voice behavior are unchanged.',
    `The model actually selected for this request is ${selected.name}.`,
    `Account plan: ${options.hasBoost ? 'Boost or administrator' : 'Free'}.`,
    ...descriptions,
    `Available image models: ${images.map(model => `${model.name} (${model.creditsPerImage} credit${model.creditsPerImage === 1 ? '' : 's'} per image)`).join(', ') || 'none in this request'}.`,
    ...(images.length ? [`Free image allowance: ${ARC_FREE_IMAGE_DAILY_CREDITS} shared image credits per UTC day. Boost retains unlimited image access. Failed generation reservations are refunded; credit costs apply per output image, including batches.`] : []),
    ...(options.voiceModel === ARC_VOICE_MODEL.id ? [`Live voice uses ${ARC_VOICE_MODEL.name}; tool delegation uses GPT 6 Luna. Voice choice names are separate from the provider model.`] : []),
    'Use real model names. Do not claim a tool was used, a different model was called, or an upgrade happened without a confirmed result.',
    'Daily limits reset at UTC midnight. Do not claim faster measured latency, unlimited context, or an unavailable model. Offer the actual picker or upgrade route when access is limited.',
  ].join('\n');
}
