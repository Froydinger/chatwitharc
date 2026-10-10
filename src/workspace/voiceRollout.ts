/** Design-only rollback. It does not change voice entitlement, models or audio. */
export const WORKSPACE_VOICE_UI_ENABLED = import.meta.env?.VITE_WORKSPACE_VOICE_UI_ENABLED !== 'false';

export function shouldHostWorkspaceVoice(input: {
  workspaceEnabled: boolean; userId?: string | null; isAnonymous: boolean;
  authLoading: boolean; needsOnboarding: boolean; nativeIOS: boolean;
}): boolean {
  // Deliberately independent of pathname, viewport, theme and the design flag.
  return input.workspaceEnabled && !!input.userId && !input.isAnonymous
    && !input.authLoading && !input.needsOnboarding && !input.nativeIOS;
}
