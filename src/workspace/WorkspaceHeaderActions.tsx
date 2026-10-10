import { useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { WorkspaceHeaderActionsContext } from './WorkspaceContext';

/** Page-owned controls keep their controller lifecycle while appearing in the
 * persistent Workspace toolbar. The outlet is absent outside Workspace. */
export function WorkspaceHeaderActions({ children }: { children: ReactNode }) {
  const target = useContext(WorkspaceHeaderActionsContext);
  return target ? createPortal(children, target) : null;
}
