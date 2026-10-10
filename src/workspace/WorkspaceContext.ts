import { createContext, useContext } from 'react';
/** The legacy layout is the default for components outside the authenticated shell. */
export const WorkspaceUIContext = createContext(false);
export const useWorkspaceUI = () => useContext(WorkspaceUIContext);

/** The toolbar outlet is provided only by the active Workspace chrome. */
export const WorkspaceHeaderActionsContext = createContext<HTMLElement | null>(null);
