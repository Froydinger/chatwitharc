import type { LunaReasoningSelection } from '@/store/useModelStore';

/** In-memory request data. Files stay File objects, never expiring preview URLs. */
export interface ComposerRequestSnapshot {
  id: string;
  content: string;
  createdAt: number;
  ownerId: string;
  sessionId: string;
  executionMode: 'ask' | 'auto';
  images: readonly File[];
  documents: readonly File[];
  modes: Readonly<{
    image: boolean; code: boolean; canvas: boolean; search: boolean; git: boolean;
    regularChat: boolean; editImages: boolean;
  }>;
  corporateMode: boolean;
  hasExistingApp: boolean;
  workspace: Readonly<{ isOpen: boolean; canvasType: 'writing' | 'code'; content: string; codeLanguage: string }>;
  gitModelMode?: 'normal' | 'pro';
  appModelMode?: 'fast' | 'pro';
  reasoningSelection: LunaReasoningSelection;
  imageOptions: Readonly<{ aspect: string; editAspect: string; count: number; generationModel?: string; editModel?: string; quality?: string }>;
}

export interface ComposerDispatchScope {
  ownerId: string | null;
  sessionId: string | null;
  executionMode: 'ask' | 'auto';
}

export function ownsComposerRequest(request: ComposerRequestSnapshot, scope: ComposerDispatchScope): boolean {
  return request.ownerId === scope.ownerId && request.sessionId === scope.sessionId
    && request.executionMode === scope.executionMode;
}

export function snapshotComposerRequest(input: Omit<ComposerRequestSnapshot, 'id' | 'createdAt'>): ComposerRequestSnapshot {
  return Object.freeze({
    ...input,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    images: Object.freeze([...input.images]),
    documents: Object.freeze([...input.documents]),
    workspace: Object.freeze({ ...input.workspace }),
    modes: Object.freeze({ ...input.modes }),
    imageOptions: Object.freeze({ ...input.imageOptions }),
  });
}
