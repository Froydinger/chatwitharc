import type { CSSProperties } from 'react';

export type WorkspaceComposerAnchor = Pick<DOMRect, 'top' | 'left' | 'width'>;

/** A single natural-height stack replaces estimated heights between floating
 * creation surfaces. Composer state and action handlers stay in ChatInput. */
export function workspaceCreateDockStyle(anchor: WorkspaceComposerAnchor | null, viewportHeight: number, visibleTop = 0): CSSProperties {
  return anchor ? {
    left: `${anchor.left}px`,
    width: `${anchor.width}px`,
    bottom: `${Math.max(12, viewportHeight - anchor.top + 10)}px`,
    maxHeight: `min(60dvh, ${Math.max(0, anchor.top - visibleTop - 20)}px)`,
  } : {
    bottom: 'calc(120px + env(safe-area-inset-bottom, 0px))',
    maxHeight: 'min(60dvh, calc(100dvh - 160px))',
  };
}
