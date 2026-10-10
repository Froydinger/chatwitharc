import { createContext, useContext } from 'react';

/** Opt-in, page-local presentation. Shared Settings controllers retain their legacy default. */
export const WorkspaceSettingsRowsContext = createContext(false);
export const useWorkspaceSettingsRows = () => useContext(WorkspaceSettingsRowsContext);
