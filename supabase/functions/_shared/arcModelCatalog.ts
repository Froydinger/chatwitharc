import { ARC_LUNA, ARC_SOL, ARC_ASTRA, normalizeArcModelSelection, type ArcModelSelection } from './arcModelRouting.ts';
/** Current product catalog. Listing a model never grants account access. */
export const ARC_TEXT_MODELS = [
  { id: ARC_LUNA, name: 'GPT 6 Luna', family: 'gpt', boostOnly: false },
  { id: ARC_SOL, name: 'GPT 6.1 Sol', family: 'gpt', boostOnly: false },
  { id: ARC_ASTRA, name: 'GPT 6 Astra', family: 'gpt', boostOnly: true },
] as const;
export type ArcTextModelId = typeof ARC_TEXT_MODELS[number]['id'];
export const ARC_CHAT_MODES = [
  { id: 'auto', name: 'Auto', attribution: 'Powered by GPT 6 & 6.1' },
  ...ARC_TEXT_MODELS.map(model => ({ id: model.id, name: model.name, attribution: `Powered by ${model.name}` })),
] as const;
export type ArcChatMode = ArcModelSelection;
export const normalizeArcChatMode = normalizeArcModelSelection;
export const arcResponseMode = normalizeArcModelSelection;
// Retained only for the dormant Flash quota adapter and historical records.
export const ARC_FREE_FLASH_DAILY_LIMIT = 20;
export const ARC_FREE_IMAGE_DAILY_CREDITS = 30;
export const ARC_IMAGE_MODELS = [
  { id: 'gpt-image-2.5-flare', name: 'GPT Image 2.5 Flare', creditsPerImage: 1 },
  { id: 'gpt-image-2.5-sunburst', name: 'GPT Image 2.5 Sunburst High', creditsPerImage: 4 },
] as const;
export function arcUsageLabel(hasBoost: boolean): 'Less usage' | 'More usage' {
  return hasBoost ? 'More usage' : 'Less usage';
}
export function arcUsagePercent(used: number, limit: number): number {
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) throw new Error('Invalid usage meter.');
  return Math.min(100, Math.max(0, Math.round(used / limit * 100)));
}
/** Square-image display estimate only. imagePolicy/SQL authoritatively price
 * size and quality and settle previously reserved images. */
export function arcImageCreditCost(modelId: string, imageCount: number): number {
  const model = ARC_IMAGE_MODELS.find(item => item.id === modelId);
  if (!model || !Number.isInteger(imageCount) || imageCount < 1 || imageCount > 3) throw new Error('Invalid image credit request.');
  return model.creditsPerImage * imageCount;
}
export const ARC_VOICE_MODEL = { id: 'gpt-live-1', name: 'GPT Live 1' } as const;
export function arcTextModel(id: string) { return ARC_TEXT_MODELS.find(model => model.id === id); }
export const normalizeArcTextSelection = normalizeArcModelSelection;
export function arcTextAccess(id: string, _hasBoost: boolean, isAdmin = false):
  { kind: 'unavailable' | 'boost-required' | 'included' } {
  const model = arcTextModel(id);
  if (!model) return { kind: 'unavailable' };
  return { kind: model.boostOnly && !_hasBoost && !isAdmin ? 'boost-required' : 'included' };
}
/** Actual selection and actual enabled transports only; the catalog does not
 * authorize a provider request or promise an allowance that has not been read. */
export function arcModelContext(options: {
  selectedModel: string; hasBoost: boolean; isAdmin?: boolean;
  availableTextModels: readonly string[]; availableImageModels: readonly string[]; voiceModel?: string;
}): string {
  const selected = arcTextModel(options.selectedModel);
  if (!selected || !options.availableTextModels.includes(selected.id)
    || arcTextAccess(selected.id, options.hasBoost, options.isAdmin).kind !== 'included') {
    throw new Error('Selected model is not available.');
  }
  const text = ARC_TEXT_MODELS.filter(model => options.availableTextModels.includes(model.id)
    && arcTextAccess(model.id, options.hasBoost, options.isAdmin).kind === 'included');
  const images = ARC_IMAGE_MODELS.filter(model => options.availableImageModels.includes(model.id));
  return [
    'ARC MODEL AND PLAN CONTEXT — authoritative application configuration',
    'You are Arc. Arc Matrix is the orchestrator and Auto mode, not a provider model.',
    'The picker offers Auto, GPT 6 Luna, GPT 6.1 Sol, and GPT 6 Astra. Auto uses Luna for conversation and Sol for writing, canvas, code, and quick web search. Explicit selections retain that model across its tools.',
    'GPT 6 Luna is free and unlimited on Free and Boost, subject to safety and abuse controls. GPT 6.1 Sol draws from its usage allowance, including when Auto selects Sol. When Sol allowance runs out, requests switch to Luna with a clear notice. Only quote a balance or limit from a verified account-usage result.',
    'GPT 6 Astra is available to current Boost accounts with a separate monthly allowance. Free accounts need Boost. Administrators are metered but uncapped. The future Boost Pro plan is Coming soon; its price and perks are not defined. Existing billing and Stripe prices are unchanged.',
    `The model actually selected for this request is ${selected.name}.`,
    `Account plan: ${options.isAdmin ? 'Administrator' : options.hasBoost ? 'Boost' : 'Free'}.`,
    `Available text models for this request: ${text.map(model => model.name).join(', ')}.`,
    `Available image models: ${images.map(model => model.name).join(', ') || 'none in this request'}.`,
    ...(images.length ? [`Free image allowance: ${ARC_FREE_IMAGE_DAILY_CREDITS} Flare Low outputs per calendar month UTC. Boost has 250 shared monthly image credits across available models; existing Boost can retain unlimited images until a fixed transition expiry; admins and active unlimited offers bypass quantity limits. Optional monthly refill restores the base allowance and forfeits unused base credits when enabled. Costs vary by quality and size and apply to completed output images. Failed reservations are refunded.`] : []),
    ...(options.voiceModel === ARC_VOICE_MODEL.id ? [`Live voice uses ${ARC_VOICE_MODEL.name}; tool delegation uses GPT 6 Luna. Voice names, limits and behavior are unchanged.`] : []),
    'Deep Search and Ultra Deep Search retain Perplexity research. Do not claim that a tool ran, a different model was called, or an upgrade happened without a confirmed result. Do not advertise retired Gemini choices or invent measured speed, context limits, or account quotas.',
  ].join('\n');
}
