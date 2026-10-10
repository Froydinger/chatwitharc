import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { workspaceCreateDockStyle, type WorkspaceComposerAnchor } from '@/workspace/createDockLayout';
import '@/workspace/workspace-create-modes.css';

export function WorkspaceCreateDock({ portalRoot, anchor, inline = false, children }: {
  portalRoot: HTMLElement | null;
  anchor: WorkspaceComposerAnchor | null;
  inline?: boolean;
  children: ReactNode;
}) {
  const content = <section aria-label="Creation options" className={`workspace-ui ws-create-stack${inline ? ' ws-create-stack-inline' : ''}${anchor ? '' : ' ws-create-stack-unanchored'}`}
    style={inline ? undefined : workspaceCreateDockStyle(anchor, window.innerHeight, window.visualViewport?.offsetTop ?? 0)}>
    {children}
  </section>;
  return inline ? content : portalRoot ? createPortal(content, portalRoot) : null;
}
