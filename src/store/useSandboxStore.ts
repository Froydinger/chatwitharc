import { create } from 'zustand';

/**
 * Tracks the dev server currently running in the Git-mode cloud sandbox.
 *
 * This used to drive an interactive floating iframe preview. That surface is
 * gone — the app is now observed through BotTestViewer while the bot drives it
 * with Playwright — so the store keeps only what still matters: which URL is
 * live, so the model can be told to reuse it instead of launching a second
 * dev server, and so Playwright has somewhere to point.
 */
interface SandboxPreviewState {
  previewUrl: string | null;
  repo: string | null;
  port: number | null;
  openPreview: (url: string, repo?: string | null, port?: number | null) => void;
  closePreview: () => void;
}

export const useSandboxStore = create<SandboxPreviewState>((set) => ({
  previewUrl: null,
  repo: null,
  port: null,
  openPreview: (url, repo, port) => {
    // Extract port from the E2B host (https://<port>-<id>.e2b.app) when not given.
    let extractedPort = port || null;
    if (!extractedPort) {
      const match = url.match(/https?:\/\/(\d+)-/);
      if (match) extractedPort = parseInt(match[1], 10);
    }
    set({ previewUrl: url, repo: repo || null, port: extractedPort });
  },
  closePreview: () => set({ previewUrl: null, repo: null, port: null }),
}));
