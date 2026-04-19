/**
 * Local AI Service - Runs Gemma 3 4B in-browser via WebLLM (WebGPU).
 * Pro-only feature. Model downloads ~2.5GB once, cached in IndexedDB forever.
 */
import type { MLCEngineInterface, InitProgressReport, AppConfig } from '@mlc-ai/web-llm';

// Gemma 3 4B Instruct (text-only, vision PR not yet merged into WebLLM stable)
export const LOCAL_MODEL_ID = 'gemma-3-4b-it-q4f16_1-MLC';
export const LOCAL_MODEL_LABEL = 'Gemma 3 4B';

// Side-loaded Gemma 3 4B via custom model_list (MLC HuggingFace build).
// Falls back to stable Gemma 2 9B → 2B if Gemma 3 fails to load (WebGPU/LinkError).
const GEMMA3_MODEL_ID = 'gemma-3-4b-it-q4f16_1-MLC';
const GEMMA3_MODEL_URL = 'https://huggingface.co/mlc-ai/gemma-3-4b-it-q4f16_1-MLC/resolve/main/';
const GEMMA3_LIB_URL =
  'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/gemma3-4b-it-q4f16_1-ctx4k_cs1k-webgpu.wasm';

const FALLBACK_MODEL_LARGE = 'gemma-2-9b-it-q4f16_1-MLC';
const FALLBACK_MODEL_SMALL = 'gemma-2-2b-it-q4f16_1-MLC';

const PREFERRED_MODEL = GEMMA3_MODEL_ID;

let enginePromise: Promise<MLCEngineInterface> | null = null;
let activeModelId: string | null = null;

export interface LoadProgressEvent {
  progress: number; // 0-1
  text: string;
}

export async function isWebGPUSupported(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) return false;
  try {
    // @ts-ignore
    const adapter = await (navigator as any).gpu.requestAdapter();
    return !!adapter;
  } catch {
    return false;
  }
}

export async function loadLocalModel(
  onProgress?: (e: LoadProgressEvent) => void,
  preferredModel: string = PREFERRED_MODEL
): Promise<MLCEngineInterface> {
  if (enginePromise && activeModelId === preferredModel) {
    return enginePromise;
  }

  const supported = await isWebGPUSupported();
  if (!supported) {
    throw new Error('WebGPU is not supported in this browser. Try Chrome, Edge, or Brave on a desktop with a modern GPU.');
  }

  const { CreateMLCEngine, prebuiltAppConfig } = await import('@mlc-ai/web-llm');

  const initProgressCallback = (report: InitProgressReport) => {
    onProgress?.({
      progress: typeof report.progress === 'number' ? report.progress : 0,
      text: report.text || 'Loading…',
    });
  };

  // Custom AppConfig that side-loads Gemma 3 4B alongside the stable prebuilt list.
  const customAppConfig: AppConfig = {
    ...prebuiltAppConfig,
    model_list: [
      {
        model: GEMMA3_MODEL_URL,
        model_id: GEMMA3_MODEL_ID,
        model_lib: GEMMA3_LIB_URL,
        overrides: { context_window_size: 4096 },
      },
      ...prebuiltAppConfig.model_list,
    ],
  };

  // Try Gemma 3 4B → Gemma 2 9B → Gemma 2 2B
  enginePromise = (async () => {
    const tryLoad = async (id: string, label: string) => {
      activeModelId = id;
      onProgress?.({ progress: 0, text: `Loading ${label}…` });
      return await CreateMLCEngine(id, { appConfig: customAppConfig, initProgressCallback });
    };

    try {
      return await tryLoad(preferredModel, 'Gemma 3 4B');
    } catch (err) {
      console.warn('Gemma 3 4B failed, falling back to Gemma 2 9B:', err);
      try {
        return await tryLoad(FALLBACK_MODEL_LARGE, 'Gemma 2 9B');
      } catch (err2) {
        console.warn('Gemma 2 9B failed, falling back to Gemma 2 2B:', err2);
        return await tryLoad(FALLBACK_MODEL_SMALL, 'Gemma 2 2B');
      }
    }
  })();

  return enginePromise;
}

export function getActiveLocalModelLabel(): string {
  if (activeModelId?.startsWith('gemma-3-4b')) return 'Gemma 3 4B';
  if (activeModelId?.startsWith('gemma-3')) return 'Gemma 3';
  if (activeModelId?.startsWith('gemma-2-9b')) return 'Gemma 2 9B (fallback)';
  if (activeModelId?.startsWith('gemma-2-2b')) return 'Gemma 2 2B (fallback)';
  return LOCAL_MODEL_LABEL;
}

export async function unloadLocalModel(): Promise<void> {
  if (enginePromise) {
    try {
      const engine = await enginePromise;
      await engine.unload?.();
    } catch (e) {
      console.warn('Error unloading local model:', e);
    }
    enginePromise = null;
    activeModelId = null;
  }
}

export interface LocalChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Stream a chat completion from the local model.
 * Mirrors the cloud streaming API for drop-in routing.
 */
export async function streamLocalChat(
  messages: LocalChatMessage[],
  onDelta: (chunk: string) => void,
  abortSignal?: AbortSignal
): Promise<string> {
  const engine = await loadLocalModel();

  const completion = await engine.chat.completions.create({
    messages: messages as any,
    stream: true,
    temperature: 0.7,
    max_tokens: 1024,
  });

  let full = '';
  for await (const chunk of completion as any) {
    if (abortSignal?.aborted) {
      try { (completion as any).controller?.abort?.(); } catch {}
      break;
    }
    const delta = chunk.choices?.[0]?.delta?.content || '';
    if (delta) {
      full += delta;
      onDelta(delta);
    }
  }
  return full;
}
