import { type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { isNativeIOSAppRuntime } from '@/lib/installedAppRuntime';
import { WorkspaceUIContext } from './WorkspaceContext';
import { WorkspaceShell } from './WorkspaceShell';
import { shouldUseWorkspace, WORKSPACE_UI_ENABLED } from './rollout';
import './workspace.css';
import { WorkspaceVoiceContext } from './WorkspaceVoiceContext';
import { WorkspaceVoiceHost } from './WorkspaceVoiceHost';
import { shouldHostWorkspaceVoice } from './voiceRollout';

/** Kept above the existing routes and never keyed by route, theme, model or voice.
 * Existing pages/providers retain their normal route lifecycle inside the shell. */
export function WorkspaceBoundary({ children }: { children: ReactNode }) {
  const { user, loading, isAnonymous, needsOnboarding } = useAuth();
  const { pathname } = useLocation();
  const enabled = shouldUseWorkspace({
    enabled: WORKSPACE_UI_ENABLED, pathname, userId: user?.id,
    isAnonymous, authLoading: loading, needsOnboarding, nativeIOS: isNativeIOSAppRuntime(),
  });
  const hostVoice = shouldHostWorkspaceVoice({ workspaceEnabled: WORKSPACE_UI_ENABLED,
    userId: user?.id, isAnonymous, authLoading: loading, needsOnboarding, nativeIOS: isNativeIOSAppRuntime() });
  return <WorkspaceVoiceContext.Provider value={hostVoice}><WorkspaceUIContext.Provider value={enabled}>
    {enabled ? <WorkspaceShell>{children}</WorkspaceShell> : children}
    {hostVoice && <WorkspaceVoiceHost key={user.id} ownerId={user.id} workspace={enabled} />}
  </WorkspaceUIContext.Provider></WorkspaceVoiceContext.Provider>;
}
