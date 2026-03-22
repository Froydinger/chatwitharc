import { create } from 'zustand';
import type { VirtualFileSystem, AgentAction } from '@/types/ide';

interface IDEState {
  isOpen: boolean;
  ideFiles: VirtualFileSystem | null;
  ideActions: AgentAction[];
  ideIsRunning: boolean;
  idePrompt: string | null;
  ideAutoRunPrompt: boolean;
  ideProjectId: string | null;
  ideMessages: any[];

  // Actions
  openIDECanvas: (prompt: string, files?: VirtualFileSystem, autoRunPrompt?: boolean) => void;
  reopenIDECanvas: (projectId: string, files: VirtualFileSystem, messages?: any[], initialPrompt?: string) => void;
  closeIDE: () => void;
  setIdeFiles: (files: VirtualFileSystem) => void;
  setIdeActions: (actions: AgentAction[] | ((prev: AgentAction[]) => AgentAction[])) => void;
  setIdeIsRunning: (running: boolean) => void;
  clearIdePrompt: () => void;
  setIdeProjectId: (id: string | null) => void;
  setIdeMessages: (messages: any[]) => void;
}

export const useIDEStore = create<IDEState>((set) => ({
  isOpen: false,
  ideFiles: null,
  ideActions: [],
  ideIsRunning: false,
  idePrompt: null,
  ideAutoRunPrompt: false,
  ideProjectId: null,
  ideMessages: [],

  openIDECanvas: (prompt, files, autoRunPrompt = false) => {
    set({
      isOpen: true,
      idePrompt: prompt,
      ideAutoRunPrompt: autoRunPrompt,
      ideFiles: files || null,
      ideActions: [],
      ideIsRunning: false,
      ideProjectId: null,
      ideMessages: [],
    });
  },

  reopenIDECanvas: (projectId, files, messages, initialPrompt) => {
    set({
      isOpen: true,
      idePrompt: initialPrompt ?? null,
      ideAutoRunPrompt: !!initialPrompt,
      ideFiles: files,
      ideActions: [],
      ideIsRunning: false,
      ideProjectId: projectId,
      ideMessages: messages || [],
    });
  },

  closeIDE: () => set({ isOpen: false }),

  setIdeFiles: (files) => set({ ideFiles: files }),
  setIdeActions: (actions) => set(state => ({
    ideActions: typeof actions === 'function' ? actions(state.ideActions) : actions,
  })),
  setIdeIsRunning: (running) => set({ ideIsRunning: running }),
  clearIdePrompt: () => set({ idePrompt: null, ideAutoRunPrompt: false }),
  setIdeProjectId: (id) => set({ ideProjectId: id }),
  setIdeMessages: (messages) => set({ ideMessages: messages }),
}));
