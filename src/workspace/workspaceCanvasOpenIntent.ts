import type { CanvasType } from '@/store/useCanvasStore';

export const WORKSPACE_CANVAS_OPEN_EVENT = 'workspace-open-canvas';

export type WorkspaceCanvasOpenIntent =
  | { sessionId: string; kind: 'new' }
  | { sessionId: string; kind: 'artifact'; content: string; type: CanvasType; language: string };

export function requestWorkspaceCanvasOpen(intent: WorkspaceCanvasOpenIntent) {
  window.dispatchEvent(new CustomEvent<WorkspaceCanvasOpenIntent>(WORKSPACE_CANVAS_OPEN_EVENT, { detail: intent }));
}
