let supported: boolean | undefined;
const listeners = new Set<() => void>();

/** Match metal-fx 1.0.4's renderer choice; it never falls back from OffscreenCanvas to DOM WebGL. */
export function detectMetalFxSupport(): boolean {
  if (typeof document === "undefined") return false;

  let canvas: HTMLCanvasElement | OffscreenCanvas | undefined;
  let host: HTMLCanvasElement | undefined;
  let context: WebGLRenderingContext | null = null;
  try {
    // The shared GL renderer copies into a DOM 2D canvas for every instance.
    host = document.createElement("canvas");
    host.width = host.height = 1;
    if (!host.getContext("2d", { alpha: true })) return false;

    const attributes = { alpha: true, premultipliedAlpha: false, antialias: false };
    if (typeof OffscreenCanvas !== "undefined") {
      canvas = new OffscreenCanvas(1, 1);
      context = canvas.getContext("webgl", attributes);
    } else {
      const domCanvas = document.createElement("canvas");
      canvas = domCanvas;
      domCanvas.width = domCanvas.height = 1;
      context = domCanvas.getContext("webgl", { ...attributes, preserveDrawingBuffer: true })
        ?? domCanvas.getContext("experimental-webgl") as WebGLRenderingContext | null;
    }
    return context !== null && !context.isContextLost();
  } catch {
    // Browser policy, exhausted contexts and partial canvas implementations
    // must not prevent access to the controls underneath a decoration.
    return false;
  } finally {
    // These are detached probes, never the package's shared live renderer.
    try { context?.getExtension("WEBGL_lose_context")?.loseContext(); } catch { /* best effort */ }
    if (canvas) canvas.width = canvas.height = 0;
    if (host) host.width = host.height = 0;
  }
}

export function getMetalFxSupport(): boolean {
  return supported === true;
}

export function subscribeMetalFxSupport(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Called after mount, once per document. SSR never populates the browser cache. */
export function checkMetalFxSupport(): void {
  if (supported !== undefined || typeof document === "undefined") return;
  supported = detectMetalFxSupport();
  listeners.forEach(listener => listener());
}

export function disableMetalFx(): void {
  if (supported === false) return;
  supported = false;
  listeners.forEach(listener => listener());
}

/** Only the package's known initialization failures belong to this fallback. */
export function isMetalFxInitializationError(error: unknown): boolean {
  return error instanceof Error && (
    /^metal-fx: (?:WebGL not supported|canvas 2D context unavailable|gl\.create(?:Shader|Program|Buffer) returned null)$/.test(error.message)
    || /^metal-fx: (?:shader compile failed|program link failed): /.test(error.message)
  );
}
