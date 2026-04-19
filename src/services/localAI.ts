/**
 * Local AI Service - Runs Gemma 3 4B in-browser via WebLLM (WebGPU).
 * Pro-only feature. Model downloads ~2.5GB once, cached in IndexedDB forever.
 */
import type { CreateMLCEngine, MLCEngineInterface, InitProgressReport } from '@mlc-ai/web-llm';

// Gemma 3 4B Instruct (q4f16_1 quantization — ~2.5GB, vision capable in newer WebLLM builds)
export const LOCAL_MODEL_ID = 'gemma-2-2b-it-q4f16_1-MLC';
export const LOCAL_MODEL_LABEL = 'Gemma 2 2B';

// NOTE: WebLLM's prebuilt list currently ships Gemma 2 series stably.
// Gemma 3 4B is rolling out; we attempt it first and gracefully fall back.
const PREFERRED_MODEL = 'gemma-2-9b-it-q4f16_1-MLC';
const FALLBACK_MODEL = 'gemma-2-2b-it-q4f16_1-MLC';

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

  const { CreateMLCEngine } = await import('@mlc-ai/web-llm');

  const initProgressCallback = (report: InitProgressReport) => {
    onProgress?.({
      progress: typeof report.progress === 'number' ? report.progress : 0,
      text: report.text || 'Loading…',
    });
  };

  // Try preferred model first, fall back to smaller one if unavailable
  enginePromise = (async () => {
    try {
      activeModelId = preferredModel;
      return await CreateMLCEngine(preferredModel, { initProgressCallback });
    } catch (err) {
      console.warn('Preferred local model failed, falling back:', err);
      activeModelId = FALLBACK_MODEL;
      return await CreateMLCEngine(FALLBACK_MODEL, { initProgressCallback });
    }
  })();

  return enginePromise;
}

export function getActiveLocalModelLabel(): string {
  if (activeModelId?.startsWith('gemma-2-9b')) return 'Gemma 2 9B';
  if (activeModelId?.startsWith('gemma-2-2b')) return 'Gemma 2 2B';
  if (activeModelId?.startsWith('gemma-3')) return 'Gemma 3';
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
