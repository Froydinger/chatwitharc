/**
 * Smart request router for Arc Local.
 * Decides whether a user request runs on a local model or in the cloud,
 * and exposes a precise, model-accurate label for the source badge.
 */
import { useLocalAIStore } from '@/store/useLocalAIStore';
import { useCorporateModeStore } from '@/store/useCorporateModeStore';
import { FAST_MODEL, QUALITY_MODEL, FAST_FALLBACK, IOS_LITE_MODEL, getActiveLocalModelId } from '@/services/localAI';
import { isMobileLocalDevice } from '@/utils/mobileLocal';

/**
 * Specific destinations. Each value maps to ONE concrete model so users
 * always see exactly what produced a response.
 */
export type RouteDestination =
  | 'local'                     // On-device model (label resolved at render)
  | 'cloud-chat'                // Gemini 3 Flash — default chat
  | 'cloud-chat-pro'            // Gemini 2.5 Pro — heavier reasoning
  | 'cloud-search'              // Perplexity (sonar-pro)
  | 'cloud-search-tavily'       // Tavily fallback
  | 'cloud-vision'              // Gemini 3 Flash (image understanding)
  | 'cloud-document'            // Gemini 3 Flash (document analysis)
  | 'cloud-voice'               // OpenAI Realtime
  | 'cloud-code'                // Gemini 2.5 Pro — /code, canvas code edits
  | 'cloud-canvas'              // Gemini 2.5 Pro — writing canvas
  | 'cloud-image'               // Gemini 3.1 Flash Image (Nano Banana)
  | 'cloud-image-pro'           // Gemini 3 Pro Image
  | 'cloud-image-edit'          // Gemini 3.1 Flash Image — edit pass
  | 'cloud-ide';                // App Builder / IDE agent

export interface RouteContext {
  forceWebSearch?: boolean;
  forceCanvas?: boolean;
  forceCode?: boolean;
  hasImageAttachment?: boolean;
  isImageGenerationRequest?: boolean;
  isVoiceMode?: boolean;
}

/**
 * Decide where a request should run.
 * Local routing only happens when the user enabled it AND the model is ready
 * AND the request is plain text (no images, search, voice, code, canvas).
 */
export function routeRequest(ctx: RouteContext): RouteDestination {
  const { enabled, status, preferCloud } = useLocalAIStore.getState();
  const corporate = useCorporateModeStore.getState().enabled;
  const mobileLocal = isMobileLocalDevice();

  // Corporate Mode: hard-lock to local on desktop only, ignore every cloud-bound flag.
  // (The chat send path independently blocks tools before they reach here.)
  if (corporate && !mobileLocal) return 'local';

  if (ctx.isVoiceMode) return 'cloud-voice';
  if (ctx.isImageGenerationRequest) return 'cloud-image';
  if (ctx.hasImageAttachment) return 'cloud-vision';
  if (ctx.forceWebSearch) return 'cloud-search';
  if (ctx.forceCode) return 'cloud-code';
  if (ctx.forceCanvas) return 'cloud-canvas';

  // User explicitly opted to use cloud models for plain chat even when local is ready.
  if (preferCloud) return 'cloud-chat';

  // Mobile local is only allowed in Corporate Mode; normal mobile chat stays cloud-backed
  // so the main memory/search/tool flow remains intact.
  if (enabled && status === 'ready' && !mobileLocal) return 'local';
  return 'cloud-chat';
}

/** Human-readable label for the source badge — shows the real model name. */
export function getRouteLabel(route: RouteDestination): { label: string; icon: 'local' | 'cloud'; tooltip: string } {
  switch (route) {
    case 'local': {
      let label = 'Local Model';
      const activeId = getActiveLocalModelId();
      const selectedId = useLocalAIStore.getState().selectedModelId;
      const id = activeId || selectedId;
      if (id === FAST_MODEL) label = 'Llama 3.2 3B';
      else if (id === QUALITY_MODEL) label = 'Gemma 2 9B';
      else if (id === FAST_FALLBACK) label = 'Gemma 2 2B';
      else if (id === IOS_LITE_MODEL) label = 'Llama 3.2 1B (iOS)';
      return {
        label: `Local · ${label}`,
        icon: 'local',
        tooltip: `Generated on your device with ${label} — private and offline.`,
      };
    }
    case 'cloud-chat':
      return { label: 'Cloud · Gemini 3 Flash', icon: 'cloud', tooltip: 'Default chat model — Google Gemini 3 Flash.' };
    case 'cloud-chat-pro':
      return { label: 'Cloud · Gemini 2.5 Pro', icon: 'cloud', tooltip: 'Heavier reasoning — Google Gemini 2.5 Pro.' };
    case 'cloud-search':
      return { label: 'Cloud · Perplexity Sonar Pro', icon: 'cloud', tooltip: 'Web search via Perplexity sonar-pro.' };
    case 'cloud-search-tavily':
      return { label: 'Cloud · Tavily Search', icon: 'cloud', tooltip: 'Web search via Tavily (fallback provider).' };
    case 'cloud-vision':
      return { label: 'Cloud · Gemini 3 Flash (Vision)', icon: 'cloud', tooltip: 'Image understanding — Google Gemini 3 Flash.' };
    case 'cloud-document':
      return { label: 'Cloud · Gemini 3 Flash (Docs)', icon: 'cloud', tooltip: 'Document analysis — Google Gemini 3 Flash.' };
    case 'cloud-voice':
      return { label: 'Cloud · OpenAI Realtime', icon: 'cloud', tooltip: 'Voice mode — OpenAI Realtime API.' };
    case 'cloud-code':
      return { label: 'Cloud · Gemini 2.5 Pro (Code)', icon: 'cloud', tooltip: 'Code generation — Google Gemini 2.5 Pro.' };
    case 'cloud-canvas':
      return { label: 'Cloud · Gemini 2.5 Pro (Canvas)', icon: 'cloud', tooltip: 'Long-form writing canvas — Google Gemini 2.5 Pro.' };
    case 'cloud-image':
      return { label: 'Cloud · Gemini 3.1 Flash Image', icon: 'cloud', tooltip: 'Image generation — Google Gemini 3.1 Flash Image (Nano Banana).' };
    case 'cloud-image-pro':
      return { label: 'Cloud · Gemini 3 Pro Image', icon: 'cloud', tooltip: 'High-quality image generation — Google Gemini 3 Pro Image.' };
    case 'cloud-image-edit':
      return { label: 'Cloud · Gemini 3.1 Flash Image (Edit)', icon: 'cloud', tooltip: 'Image editing — Google Gemini 3.1 Flash Image.' };
    case 'cloud-ide':
      return { label: 'Cloud · Gemini 2.5 Pro (App Builder)', icon: 'cloud', tooltip: 'App Builder agent — Google Gemini 2.5 Pro.' };
  }
}
