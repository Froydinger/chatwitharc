import { createContext, useContext } from 'react';
/** A single authenticated host owns voice; native iOS keeps its routed owner. */
export const WorkspaceVoiceContext = createContext(false);
export const useWorkspaceVoiceHost = () => useContext(WorkspaceVoiceContext);
