import { create } from 'zustand';

interface SandboxPreviewState {
  isOpen: boolean;
  isMinimized: boolean;
  isExpanded: boolean;
  previewUrl: string | null;
  repo: string | null;
  port: number | null;
  deviceMode: 'desktop' | 'mobile';
  openPreview: (url: string, repo?: string | null, port?: number | null) => void;
  closePreview: () => void;
  toggleMinimize: () => void;
  toggleExpanded: () => void;
  setDeviceMode: (mode: 'desktop' | 'mobile') => void;
}

export const useSandboxStore = create<SandboxPreviewState>((set) => ({
  isOpen: false,
  isMinimized: false,
  isExpanded: false,
  previewUrl: null,
  repo: null,
  port: null,
  deviceMode: 'desktop',
  openPreview: (url, repo, port) => {
    // Extract port from URL if not explicitly provided
    let extractedPort = port || null;
    if (!extractedPort) {
      const match = url.match(/https?:\/\/(\d+)-/);
      if (match) extractedPort = parseInt(match[1], 10);
    }
    set({
      isOpen: true,
      isMinimized: false,
      previewUrl: url,
      repo: repo || null,
      port: extractedPort,
    });
  },
  closePreview: () => set({ isOpen: false }),
  toggleMinimize: () => set((state) => ({ isMinimized: !state.isMinimized })),
  toggleExpanded: () => set((state) => ({ isExpanded: !state.isExpanded, isMinimized: false })),
  setDeviceMode: (mode) => set({ deviceMode: mode }),
}));
