/**
 * Smart request router for Arc Local.
 * Decides whether a user request runs on a local model or in the cloud,
 * and exposes a precise, model-accurate label for the source badge.
 */
import { useLocalAIStore } from '@/store/useLocalAIStore';
import { useCorporateModeStore } from '@/store/useCorporateModeStore';
import { useModelStore } from '@/store/useModelStore';
import { FAST_MODEL, QUALITY_MODEL, FAST_FALLBACK, IOS_LITE_MODEL, getActiveLocalModelId } from '@/services/localAI';
import { isMobileLocalDevice } from '@/utils/mobileLocal';

/**
 * Specific destinations. Each value maps to ONE concrete model so users
 * always see exactly what produced a response.
 */
export type RouteDestination =
  | 'local'                     // On-device model (label resolved at render)
  | 'cloud-chat'                // GPT-5.6 Terra — default chat
  | 'cloud-chat-pro'            // GPT-5.6 Terra — heavier reasoning
  | 'cloud-search'              // Tavily Advanced retrieval + GPT synthesis
  | 'cloud-search-tavily'       // Legacy alias — same Tavily pipeline
  | 'cloud-vision'              // GPT-5.6 Terra (image understanding)
  | 'cloud-document'            // GPT-5.6 Terra (document analysis)
  | 'cloud-voice'               // OpenAI Realtime
  | 'cloud-code'                // GPT-5.6 Terra — /code, canvas code edits
  | 'cloud-canvas'              // GPT-5.6 Terra — writing canvas
  | 'cloud-image'               // GPT-Image-2 — locked image model
  | 'cloud-image-pro'           // Deprecated alias — also maps to GPT-Image-2
  | 'cloud-image-edit'          // GPT-Image-2 — edit pass
  | 'cloud-image-edit-fallback' // Edit served by Gemini fallback when GPT-Image-2 failed
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

/**
 * Human-readable label for the source badge — shows the real model name.
 * `modelUsed` is the exact model id recorded on the message when it was
 * generated; when present it wins over the picker's current selection so
 * badges stay accurate for Auto-mode routing and old messages.
 */
export function getRouteLabel(route: RouteDestination, modelUsed?: string): { label: string; icon: 'local' | 'cloud'; tooltip: string } {
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
    case 'cloud-chat-pro': {
      const m = modelUsed || useModelStore.getState().chatModel;
      const { name, tier, providerName } = getModelInfo(m);
      return { label: `Cloud · ${name}`, icon: 'cloud', tooltip: `${tier} mode — ${providerName}.` };
    }
    case 'cloud-search': {
      const m = modelUsed || useModelStore.getState().chatModel;
      const { name, providerName } = getModelInfo(m);
      return { label: `Cloud · ${name} (Web)`, icon: 'cloud', tooltip: `Web search synthesis — ${providerName}.` };
    }
    case 'cloud-search-tavily': {
      const m = modelUsed || useModelStore.getState().chatModel;
      const { name, providerName } = getModelInfo(m);
      return { label: `Cloud · ${name} (Web)`, icon: 'cloud', tooltip: `Web search synthesis — ${providerName}.` };
    }
    case 'cloud-vision': {
      const m = modelUsed || useModelStore.getState().chatModel;
      const { name, providerName } = getModelInfo(m);
      return { label: `Cloud · ${name} (Vision)`, icon: 'cloud', tooltip: `Image understanding — ${providerName}.` };
    }
    case 'cloud-document': {
      const m = modelUsed || useModelStore.getState().chatModel;
      const { name, providerName } = getModelInfo(m);
      return { label: `Cloud · ${name} (Docs)`, icon: 'cloud', tooltip: `Document analysis — ${providerName}.` };
    }
    case 'cloud-voice':
      return { label: 'Cloud · Realtime', icon: 'cloud', tooltip: 'Voice mode — Realtime API.' };
    case 'cloud-code': {
      const m = modelUsed || useModelStore.getState().chatModel;
      const { name, providerName } = getModelInfo(m);
      return { label: `Cloud · ${name} (Code)`, icon: 'cloud', tooltip: `Code generation — ${providerName}.` };
    }
    case 'cloud-canvas': {
      const m = modelUsed || useModelStore.getState().chatModel;
      const { name, providerName } = getModelInfo(m);
      return { label: `Cloud · ${name} (Canvas)`, icon: 'cloud', tooltip: `Long-form writing canvas — ${providerName}.` };
    }

    case 'cloud-image':
    case 'cloud-image-pro':
      return { label: 'Cloud · GPT Image 2', icon: 'cloud', tooltip: 'Image generation — GPT-Image-2 (medium quality).' };
    case 'cloud-image-edit':
      return { label: 'Cloud · GPT Image 2 (Edit)', icon: 'cloud', tooltip: 'Image editing — GPT-Image-2 (medium quality).' };
    case 'cloud-image-edit-fallback':
      return { label: 'Cloud · Nano Banana 2 (Edit, fallback)', icon: 'cloud', tooltip: 'GPT-Image-2 was unavailable, so this edit was served by Google Gemini Nano Banana 2 as a fallback.' };
    case 'cloud-ide':
      return { label: 'Cloud · GPT-5.6 Terra (App Builder)', icon: 'cloud', tooltip: 'App Builder agent — GPT-5.6 Terra.' };
  }
}

function getModelInfo(m: string): { name: string; tier: string; providerName: string } {
  if (m === 'gpt-5.6-sol') {
    return { name: 'GPT-5.6 Sol', tier: 'Sol', providerName: 'GPT-5.6 Sol' };
  }
  if (m === 'gpt-5.6-terra') {
    return { name: 'GPT-5.6 Terra', tier: 'Terra', providerName: 'GPT-5.6 Terra' };
  }
  if (m === 'gpt-5.6-luna') {
    return { name: 'GPT-5.6 Luna', tier: 'Luna', providerName: 'GPT-5.6 Luna' };
  }
  if (m === 'gpt-5.4-nano') {
    return { name: 'Astro', tier: 'Astro', providerName: 'GPT-5.4 Nano' };
  }
  return { name: 'GPT-5.6 Luna', tier: 'Luna', providerName: 'GPT-5.6 Luna' };
}
