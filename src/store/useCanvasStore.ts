import { create } from 'zustand';

export interface CanvasVersion {
  id: string;
  content: string;
  timestamp: number;
  label?: string;
}

export type CanvasType = 'writing' | 'code';

interface CanvasState {
  isOpen: boolean;
  content: string;
  versions: CanvasVersion[];
  activeVersionIndex: number;
  undoStack: string[];
  redoStack: string[];
  isSaving: boolean;
  isAIWriting: boolean;
  isLoading: boolean; // Loading state for non-streaming generation
  mode: 'standalone' | 'sideBySide';
  pendingPrompt: string | null;
  
  // Code mode state
  canvasType: CanvasType;
  codeLanguage: string;
  showCodePreview: boolean;

  // Actions
  openCanvas: (initialContent?: string) => void;
  reopenCanvas: () => void;
  hydrateFromSession: (content: string, type?: CanvasType, language?: string) => void;
  openSideBySide: (prompt: string) => void;
  openCodeCanvas: (code: string, language: string, label?: string) => void;
  openWithContent: (content: string, type?: CanvasType, language?: string) => void;
  openWithLoading: (type: CanvasType, language?: string) => void; // Open with loading state
  closeCanvas: () => void;
  setContent: (content: string, saveToHistory?: boolean) => void;
  setAIContent: (content: string, label?: string) => void;
  setAIWriting: (isWriting: boolean) => void;
  setLoading: (loading: boolean) => void; // Control loading state
  streamContent: (delta: string) => void;
  startStreaming: (mode: CanvasType, language?: string) => void;
  setCodeLanguage: (language: string) => void;
  setShowCodePreview: (show: boolean) => void;
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
  isLoading: false,
  mode: 'sideBySide',
  pendingPrompt: null,
  
  // Code mode defaults
  canvasType: 'writing',
  codeLanguage: 'typescript',
  showCodePreview: false, // Default to showing code editor so users see generation

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
      canvasType: 'writing',
    });
  },

  reopenCanvas: () => set({ isOpen: true }),

  hydrateFromSession: (nextContent: string, type: CanvasType = 'writing', language = 'typescript') => {
    const initialVersion: CanvasVersion = {
      id: crypto.randomUUID(),
      content: nextContent,
      timestamp: Date.now(),
      label: 'Initial',
    };

    set({
      isOpen: false,
      content: nextContent,
      versions: nextContent ? [initialVersion] : [],
      activeVersionIndex: nextContent ? 0 : -1,
      undoStack: [],
      redoStack: [],
      isAIWriting: false,
      mode: 'sideBySide',
      pendingPrompt: null,
      canvasType: type,
      codeLanguage: language,
    });
  },
  
  openCodeCanvas: (code: string, language: string, label?: string) => {
    const initialVersion: CanvasVersion = {
      id: crypto.randomUUID(),
      content: code,
      timestamp: Date.now(),
      label: label || 'Initial',
    };
    set({
      isOpen: true,
      content: code,
      versions: code ? [initialVersion] : [],
      activeVersionIndex: code ? 0 : -1,
      undoStack: [],
      redoStack: [],
      mode: 'sideBySide',
      pendingPrompt: null,
      canvasType: 'code',
      codeLanguage: language,
      showCodePreview: false, // Show code editor by default
      isAIWriting: false,
    });
  },

  // Atomic action to set content AND open the canvas in one operation
  openWithContent: (content: string, type: CanvasType = 'writing', language = 'typescript') => {
    const initialVersion: CanvasVersion = {
      id: crypto.randomUUID(),
      content,
      timestamp: Date.now(),
      label: 'Restored',
    };
    set({
      isOpen: true,
      content,
      versions: content ? [initialVersion] : [],
      activeVersionIndex: content ? 0 : -1,
      undoStack: [],
      redoStack: [],
      mode: 'sideBySide',
      pendingPrompt: null,
      canvasType: type,
      codeLanguage: language,
      showCodePreview: false,
      isAIWriting: false,
      isLoading: false, // CRITICAL: Clear loading state
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
      isLoading: false,
    });
  },

  // Open canvas with loading state (for non-streaming generation)
  openWithLoading: (type: CanvasType, language = 'typescript') => {
    set({
      isOpen: true,
      content: '',
      versions: [],
      activeVersionIndex: -1,
      undoStack: [],
      redoStack: [],
      mode: 'sideBySide',
      pendingPrompt: null,
      isAIWriting: true,
      isLoading: true, // Show loading spinner
      canvasType: type,
      codeLanguage: language,
      showCodePreview: false,
    });
  },

  closeCanvas: () => set({
    isOpen: false,
    isLoading: false,
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
      // Explicitly set to writing mode when using setAIContent
      canvasType: 'writing',
    });
  },

  setAIWriting: (isWriting: boolean) => set({ isAIWriting: isWriting }),
  
  setLoading: (loading: boolean) => set({ isLoading: loading }),

  // Start streaming mode - opens canvas and clears content
  startStreaming: (mode: CanvasType, language = 'typescript') => {
    set({
      isOpen: true,
      content: '',
      isAIWriting: true,
      canvasType: mode,
      codeLanguage: language,
      showCodePreview: false, // Always show code editor during generation so users see streaming
      mode: 'sideBySide',
      pendingPrompt: null,
    });
  },

  // Append streamed content
  streamContent: (delta: string) => {
    const state = get();
    set({ content: state.content + delta });
  },

  setCodeLanguage: (language: string) => set({ codeLanguage: language }),
  
  setShowCodePreview: (show: boolean) => set({ showCodePreview: show }),

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
