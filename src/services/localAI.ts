/**
 * Local AI Service - Runs an open-weights instruct model in-browser via WebLLM (WebGPU).
 * Pro-only feature. Model downloads once, cached in IndexedDB forever.
 *
 * Default: Llama 3.2 3B Instruct (≈1.9GB) — fast TTFT on M-series Macs.
 * Fallback (auto): Gemma 2 2B (≈1.5GB).
 * Optional "Quality" tier: Gemma 2 9B (≈5GB) — user opt-in.
 */
import type { MLCEngineInterface, InitProgressReport } from '@mlc-ai/web-llm';

export const FAST_MODEL = 'Llama-3.2-3B-Instruct-q4f16_1-MLC';
export const FAST_FALLBACK = 'gemma-2-2b-it-q4f16_1-MLC';
export const QUALITY_MODEL = 'gemma-2-9b-it-q4f16_1-MLC';
// Small model for iOS Safari (memory-capped ~1.5GB VRAM).
// Llama 3.2 1B: 879 MB VRAM, marked low_resource_required by WebLLM,
// meaningfully smarter than Qwen 0.5B and uses *less* memory.
export const IOS_LITE_MODEL = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';

export const LOCAL_MODEL_ID = FAST_MODEL;
export const LOCAL_MODEL_LABEL = 'Llama 3.2 3B';

let enginePromise: Promise<MLCEngineInterface> | null = null;
let activeModelId: string | null = null;

type LocalModelCacheBackend = 'cache' | 'indexeddb';

const LOCAL_MODEL_IDS = [FAST_MODEL, FAST_FALLBACK, QUALITY_MODEL, IOS_LITE_MODEL] as const;

async function getWebLLMAppConfig(useIndexedDBCache: boolean) {
  const { prebuiltAppConfig } = await import('@mlc-ai/web-llm');
  return {
    ...prebuiltAppConfig,
    useIndexedDBCache,
  };
}

async function hasModelInBackend(modelId: string, backend: LocalModelCacheBackend): Promise<boolean> {
  try {
    const { hasModelInCache } = await import('@mlc-ai/web-llm');
    const appConfig = await getWebLLMAppConfig(backend === 'indexeddb');
    return await hasModelInCache(modelId, appConfig);
  } catch {
    return false;
  }
}

async function getModelCacheBackend(modelId: string): Promise<LocalModelCacheBackend | null> {
  if (await hasModelInBackend(modelId, 'indexeddb')) return 'indexeddb';
  if (await hasModelInBackend(modelId, 'cache')) return 'cache';
  return null;
}

export interface LoadProgressEvent {
  progress: number; // 0-1
  text: string;
}

/**
 * Probe IndexedDB for any already-downloaded local model.
 * Returns the cached id, or null. Checks fast → fallback → quality.
 */
export async function findCachedLocalModel(): Promise<string | null> {
  for (const id of LOCAL_MODEL_IDS) {
    if (await getModelCacheBackend(id)) return id;
  }
  return null;
}

/**
 * Returns which of the known model ids are present in IndexedDB.
 */
export async function getCachedLocalModels(): Promise<Record<string, boolean>> {
  const result: Record<string, boolean> = {
    [FAST_MODEL]: false,
    [FAST_FALLBACK]: false,
    [QUALITY_MODEL]: false,
    [IOS_LITE_MODEL]: false,
  };
  await Promise.all(
    Object.keys(result).map(async (id) => {
      result[id] = (await getModelCacheBackend(id)) !== null;
    })
  );
  return result;
}

/**
 * Returns the id of any cached local model (first one found), or null.
 * Canonical "do we have weights on disk" probe — independent of selectedModelId.
 */
export async function getAnyCachedModelId(): Promise<string | null> {
  const cached = await getCachedLocalModels();
  for (const id of Object.keys(cached)) {
    if (cached[id]) return id;
  }
  return null;
}

/**
 * Delete a single cached model from IndexedDB.
 */
export async function deleteCachedLocalModel(modelId: string): Promise<void> {
  try {
    const { deleteModelInCache } = await import('@mlc-ai/web-llm');
    const indexedDbConfig = await getWebLLMAppConfig(true);
    const cacheApiConfig = await getWebLLMAppConfig(false);
    await Promise.allSettled([
      deleteModelInCache(modelId, indexedDbConfig),
      deleteModelInCache(modelId, cacheApiConfig),
    ]);
  } catch (e) {
    console.warn('[Arc Local] Failed to delete cached model:', modelId, e);
  }
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
  preferredModel: string = FAST_MODEL
): Promise<MLCEngineInterface> {
  if (enginePromise && activeModelId === preferredModel) {
    return enginePromise;
  }

  // If a different model is already loaded, unload it first.
  if (enginePromise && activeModelId && activeModelId !== preferredModel) {
    try {
      const old = await enginePromise;
      await old.unload?.();
    } catch {}
    enginePromise = null;
    activeModelId = null;
  }

  const supported = await isWebGPUSupported();
  if (!supported) {
    throw new Error('WebGPU is not supported in this browser. Try Chrome, Edge, or Brave on a desktop with a modern GPU.');
  }

  const { CreateMLCEngine } = await import('@mlc-ai/web-llm');
  const existingBackend = await getModelCacheBackend(preferredModel);
  const useIndexedDBCache = existingBackend ? existingBackend === 'indexeddb' : true;
  const appConfig = await getWebLLMAppConfig(useIndexedDBCache);

  const initProgressCallback = (report: InitProgressReport) => {
    onProgress?.({
      progress: typeof report.progress === 'number' ? report.progress : 0,
      text: report.text || 'Loading…',
    });
  };

  enginePromise = (async () => {
    const tryLoad = async (id: string, label: string) => {
      const backend = id === preferredModel ? existingBackend : await getModelCacheBackend(id);
      const perModelAppConfig = await getWebLLMAppConfig(backend ? backend === 'indexeddb' : true);
      activeModelId = id;
      onProgress?.({ progress: 0, text: `Loading ${label}…` });
      return await CreateMLCEngine(id, { initProgressCallback, appConfig: perModelAppConfig });
    };

    // Build per-request fallback chain: preferred → fast fallback (skip duplicates).
    const chain: Array<{ id: string; label: string }> = [];
    const labelFor = (id: string) =>
      id === FAST_MODEL ? 'Llama 3.2 3B' :
      id === QUALITY_MODEL ? 'Gemma 2 9B' :
      id === FAST_FALLBACK ? 'Gemma 2 2B' :
      id === IOS_LITE_MODEL ? 'Qwen 2.5 0.5B (iOS Lite)' : id;

    chain.push({ id: preferredModel, label: labelFor(preferredModel) });
    // For iOS Lite, don't fall back to bigger models (they'll OOM Safari).
    if (preferredModel !== FAST_FALLBACK && preferredModel !== IOS_LITE_MODEL) {
      chain.push({ id: FAST_FALLBACK, label: labelFor(FAST_FALLBACK) });
    }

    let lastErr: any;
    for (const { id, label } of chain) {
      try {
        return await tryLoad(id, label);
      } catch (err) {
        console.warn(`[Arc Local] ${label} failed:`, err);
        lastErr = err;
      }
    }
    enginePromise = null;
    activeModelId = null;
    throw lastErr;
  })();

  return enginePromise;
}

export function getActiveLocalModelLabel(): string {
  if (activeModelId === FAST_MODEL) return 'Llama 3.2 3B';
  if (activeModelId === QUALITY_MODEL) return 'Gemma 2 9B';
  if (activeModelId === FAST_FALLBACK) return 'Gemma 2 2B';
  if (activeModelId === IOS_LITE_MODEL) return 'Qwen 2.5 0.5B (iOS Lite)';
  return LOCAL_MODEL_LABEL;
}

export function getActiveLocalModelId(): string | null {
  return activeModelId;
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

export interface LocalStreamStats {
  tokensPerSecond: number;
  totalDeltas: number;
  elapsedMs: number;
}

/**
 * Stream a chat completion from the local model.
 * `onDelta` fires for every token chunk. `onStats` fires periodically with
 * a running tokens/sec estimate (delta count / elapsed seconds).
 */
export async function streamLocalChat(
  messages: LocalChatMessage[],
  onDelta: (chunk: string) => void,
  abortSignal?: AbortSignal,
  onStats?: (s: LocalStreamStats) => void
): Promise<string> {
  // Honour user's selected model from the store, if any.
  let preferred: string | undefined;
  try {
    const { useLocalAIStore } = await import('@/store/useLocalAIStore');
    const sel = useLocalAIStore.getState().selectedModelId;
    if (sel) preferred = sel;
  } catch {}
  const engine = await loadLocalModel(undefined, preferred ?? FAST_MODEL);

  const completion = await engine.chat.completions.create({
    messages: messages as any,
    stream: true,
    temperature: 0.7,
    max_tokens: 512,
  });

  let full = '';
  let deltas = 0;
  const start = performance.now();
  let lastStatsAt = start;

  for await (const chunk of completion as any) {
    if (abortSignal?.aborted) {
      try { (completion as any).controller?.abort?.(); } catch {}
      break;
    }
    const delta = chunk.choices?.[0]?.delta?.content || '';
    if (delta) {
      full += delta;
      deltas += 1;
      onDelta(delta);

      const now = performance.now();
      if (onStats && now - lastStatsAt > 250) {
        const elapsedMs = now - start;
        onStats({
          tokensPerSecond: deltas / (elapsedMs / 1000),
          totalDeltas: deltas,
          elapsedMs,
        });
        lastStatsAt = now;
      }
    }
  }

  if (onStats) {
    const elapsedMs = performance.now() - start;
    onStats({
      tokensPerSecond: deltas / Math.max(elapsedMs / 1000, 0.001),
      totalDeltas: deltas,
      elapsedMs,
    });
  }
  return full;
}
