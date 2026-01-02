import { create } from 'zustand';

export interface CanvasVersion {
  id: string;
  content: string;
  timestamp: number;
  label?: string;
}

interface CanvasState {
  isOpen: boolean;
  content: string;
  versions: CanvasVersion[];
  activeVersionIndex: number;
  undoStack: string[];
  redoStack: string[];
  isSaving: boolean;
  isAIWriting: boolean;
  mode: 'standalone' | 'sideBySide';
  pendingPrompt: string | null;
  
  // Actions
  openCanvas: (initialContent?: string) => void;
  openSideBySide: (prompt: string) => void;
  closeCanvas: () => void;
  setContent: (content: string, saveToHistory?: boolean) => void;
  setAIContent: (content: string, label?: string) => void;
  setAIWriting: (isWriting: boolean) => void;
  saveVersion: (label?: string) => void;
  restoreVersion: (index: number) => void;
  undo: () => void;
  redo: () => void;
  clearCanvas: () => void;
  clearPendingPrompt: () => void;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  isOpen: false,
  content: '',
  versions: [],
  activeVersionIndex: -1,
  undoStack: [],
  redoStack: [],
  isSaving: false,
  isAIWriting: false,
  mode: 'sideBySide',
  pendingPrompt: null,

  openCanvas: (initialContent = '') => {
    const initialVersion: CanvasVersion = {
      id: crypto.randomUUID(),
      content: initialContent,
      timestamp: Date.now(),
      label: 'Initial',
    };
    set({
      isOpen: true,
      content: initialContent,
      versions: initialContent ? [initialVersion] : [],
      activeVersionIndex: initialContent ? 0 : -1,
      undoStack: [],
      redoStack: [],
      mode: 'standalone',
      pendingPrompt: null,
    });
  },

  openSideBySide: (prompt: string) => {
    set({
      isOpen: true,
      content: '',
      versions: [],
      activeVersionIndex: -1,
      undoStack: [],
      redoStack: [],
      mode: 'sideBySide',
      pendingPrompt: prompt,
      isAIWriting: true,
    });
  },

  closeCanvas: () => set({
    isOpen: false,
    // Keep content and versions so user can reopen
    isAIWriting: false,
    mode: 'sideBySide',
    pendingPrompt: null,
  }),

  setContent: (content, saveToHistory = true) => {
    const state = get();
    if (saveToHistory && state.content !== content) {
      set({
        content,
        undoStack: [...state.undoStack, state.content].slice(-50),
        redoStack: [],
      });
    } else {
      set({ content });
    }
  },

  setAIContent: (content: string, label?: string) => {
    const state = get();
    const newVersion: CanvasVersion = {
      id: crypto.randomUUID(),
      content,
      timestamp: Date.now(),
      label: label || `AI Draft ${state.versions.length + 1}`,
    };
    set({
      content,
      versions: [...state.versions, newVersion],
      activeVersionIndex: state.versions.length,
      isAIWriting: false,
    });
  },

  setAIWriting: (isWriting: boolean) => set({ isAIWriting: isWriting }),

  clearPendingPrompt: () => set({ pendingPrompt: null }),

  saveVersion: (label) => {
    const state = get();
    const newVersion: CanvasVersion = {
      id: crypto.randomUUID(),
      content: state.content,
      timestamp: Date.now(),
      label: label || `Version ${state.versions.length + 1}`,
    };
    set({
      versions: [...state.versions, newVersion],
      activeVersionIndex: state.versions.length,
    });
  },

  restoreVersion: (index) => {
    const state = get();
    const version = state.versions[index];
    if (version) {
      set({
        content: version.content,
        activeVersionIndex: index,
        undoStack: [...state.undoStack, state.content],
        redoStack: [],
      });
    }
  },

  undo: () => {
    const state = get();
    if (state.undoStack.length === 0) return;
    
    const previousContent = state.undoStack[state.undoStack.length - 1];
    set({
      content: previousContent,
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, state.content],
    });
  },

  redo: () => {
    const state = get();
    if (state.redoStack.length === 0) return;
    
    const nextContent = state.redoStack[state.redoStack.length - 1];
    set({
      content: nextContent,
      redoStack: state.redoStack.slice(0, -1),
      undoStack: [...state.undoStack, state.content],
    });
  },

  clearCanvas: () => set({
    content: '',
    undoStack: [],
    redoStack: [],
  }),
}));
