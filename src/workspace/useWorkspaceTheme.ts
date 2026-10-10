import { useEffect } from 'react';
export type WorkspaceTheme = 'light' | 'dark' | 'system';
/** Only Workspace-scoped tokens change. The existing global useTheme controller
 * remains the owner of root classes, profile persistence, and forced-dark routes. */
export function useWorkspaceTheme(mode: WorkspaceTheme) {
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.dataset.workspaceTheme;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      root.dataset.workspaceTheme = mode === 'system' ? (media.matches ? 'dark' : 'light') : mode;
    };
    apply();
    media.addEventListener('change', apply);
    return () => {
      media.removeEventListener('change', apply);
      if (previous === undefined) delete root.dataset.workspaceTheme;
      else root.dataset.workspaceTheme = previous;
    };
  }, [mode]);
}
