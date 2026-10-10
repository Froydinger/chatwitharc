/** Layout-only release switch. Set VITE_WORKSPACE_UI_ENABLED=false and rebuild
 * to restore the previous UI. No model, usage, billing, or voice gate depends on it. */
export function isWorkspaceFlagEnabled(value?: string): boolean {
  return value !== 'false';
}
export const WORKSPACE_UI_ENABLED = isWorkspaceFlagEnabled(import.meta.env?.VITE_WORKSPACE_UI_ENABLED);

/** An allowlist prevents the shell from capturing marketing, SEO, auth, shares,
 * checkout, or unknown paths. No viewport-size or subscription gating. */
export function isWorkspaceRoute(pathname: string): boolean {
  return pathname === '/' || /^\/chat\/[^/]+\/?$/.test(pathname)
    || pathname === '/dashboard' || pathname === '/dashboard/settings'
    || pathname === '/tasks' || pathname === '/shared'
    || /^\/shared\/[^/]+\/?$/.test(pathname)
    || pathname === '/build' || /^\/build\/[^/]+\/?$/.test(pathname);
}
export function shouldUseWorkspace(input: {
  enabled: boolean; pathname: string; userId?: string | null;
  isAnonymous: boolean; authLoading: boolean; needsOnboarding: boolean; nativeIOS: boolean;
}): boolean {
  return input.enabled && !!input.userId && !input.isAnonymous && !input.authLoading
    && !input.needsOnboarding && !input.nativeIOS && isWorkspaceRoute(input.pathname);
}
