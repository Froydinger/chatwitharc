import { useCallback, useEffect, useRef, useState } from 'react';

export type WorkspaceSidebarState = 'hidden' | 'peek' | 'docked';
const desktopQuery = '(min-width: 1024px) and (hover: hover) and (pointer: fine)';

// Reuse the legacy account-scoped preference while keeping the new Workspace
// navigation mounted. Peeking never moves or remounts the current page.
export function useWorkspaceSidebar(accountId?: string) {
  const [desktop, setDesktop] = useState(false);
  const [panel, setPanel] = useState<WorkspaceSidebarState>('docked');
  const sidebarRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout>>();
  const reopenTimer = useRef<ReturnType<typeof setTimeout>>();
  const suppressEdge = useRef(false);
  const focusAfterChange = useRef<'sidebar' | 'trigger' | null>(null);
  const preferenceKey = `arc_chat_sidebar_docked:${accountId ?? 'guest'}`;
  const clearDismiss = useCallback(() => clearTimeout(dismissTimer.current), []);
  const writePreference = useCallback((docked: boolean) => {
    try { localStorage.setItem(preferenceKey, String(docked)); } catch { /* Optional device preference. */ }
  }, [preferenceKey]);

  useEffect(() => {
    const media = window.matchMedia(desktopQuery);
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    clearDismiss();
    clearTimeout(reopenTimer.current);
    suppressEdge.current = false;
    focusAfterChange.current = null;
    let saved: string | null = null;
    try { saved = localStorage.getItem(preferenceKey); } catch { /* Optional device preference. */ }
    // Existing saved hide/dock choices win. New Workspace users keep its
    // visible navigation until they choose to hide it.
    setPanel(desktop && saved === 'false' ? 'hidden' : 'docked');
  }, [desktop, preferenceKey, clearDismiss]);
  useEffect(() => () => { clearDismiss(); clearTimeout(reopenTimer.current); }, [clearDismiss]);
  useEffect(() => {
    const target = focusAfterChange.current;
    focusAfterChange.current = null;
    if (target === 'trigger' && panel === 'hidden') triggerRef.current?.focus();
    if (target === 'sidebar' && panel === 'peek') sidebarRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [panel]);

  const closePeek = useCallback((restoreFocus = false) => {
    clearDismiss();
    if (restoreFocus) focusAfterChange.current = 'trigger';
    setPanel(current => current === 'peek' ? 'hidden' : current);
  }, [clearDismiss]);
  const hide = useCallback(() => {
    clearDismiss();
    focusAfterChange.current = 'trigger';
    setPanel('hidden');
    suppressEdge.current = true;
    clearTimeout(reopenTimer.current);
    reopenTimer.current = setTimeout(() => { suppressEdge.current = false; }, 350);
    writePreference(false);
  }, [clearDismiss, writePreference]);
  const dock = useCallback(() => {
    clearDismiss();
    setPanel('docked');
    writePreference(true);
  }, [clearDismiss, writePreference]);
  const peek = useCallback((fromKeyboard = false) => {
    if (!desktop || (!fromKeyboard && suppressEdge.current)) return;
    clearDismiss();
    if (fromKeyboard) focusAfterChange.current = 'sidebar';
    setPanel(current => current === 'hidden' ? 'peek' : current);
  }, [desktop, clearDismiss]);
  const dismissPeek = useCallback(() => {
    clearDismiss();
    dismissTimer.current = setTimeout(function dismiss() {
      // A portaled menu/dialog belongs to the visible navigation too. Never
      // unmount its anchor or close a keyboard user's focused sidebar.
      if (document.querySelector('[role="menu"], [role="dialog"], [role="alertdialog"]')
        || sidebarRef.current?.contains(document.activeElement)) {
        dismissTimer.current = setTimeout(dismiss, 350);
        return;
      }
      setPanel(current => current === 'peek' ? 'hidden' : current);
    }, 350);
  }, [clearDismiss]);
  useEffect(() => {
    if (!desktop || panel !== 'peek') return;
    const outside = (event: PointerEvent) => {
      if (document.querySelector('[role="menu"], [role="dialog"], [role="alertdialog"]')) return;
      const target = event.target;
      if (!(target instanceof Element) || sidebarRef.current?.contains(target) || triggerRef.current?.contains(target)
        || target.closest('[role="menu"], [role="dialog"], [role="alertdialog"]')) return;
      closePeek();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented
        || document.querySelector('[role="menu"], [role="dialog"], [role="alertdialog"]')) return;
      event.preventDefault();
      closePeek(true);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [desktop, panel, closePeek]);

  return { desktop, panel, sidebarRef, triggerRef, clearDismiss, closePeek, hide, dock, peek, dismissPeek };
}
