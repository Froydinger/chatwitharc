import { sidebarSwipeAction } from '@/lib/sidebarSwipe';
import { createPortal } from 'react-dom';
import { useEffect, useId, useRef, useState } from 'react';
import { History, PanelLeftOpen, PanelLeftClose, LayoutDashboard, MessageSquare, Pin, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ChatRowActions } from '@/components/ChatRowActions';
import { useChatPins } from '@/hooks/useChatPins';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useArcStore } from '@/store/useArcStore';
import { useAuth } from '@/hooks/useAuth';
import { useChatSync } from '@/hooks/useChatSync';

type SidebarState = 'hidden' | 'hover' | 'docked';
const desktopQuery = '(min-width: 1024px) and (hover: hover) and (pointer: fine)';
export function ChatHistorySidebar({ onOpenDashboard, onDockChange, gestureBlocked = false }: { onOpenDashboard: () => void; onDockChange: (docked: boolean) => void; gestureBlocked?: boolean }) {
  const [panel, setPanel] = useState<SidebarState>('hidden');
  const [desktop, setDesktop] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const syncInFlight = useRef(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout>>();
  const suppressEdge = useRef(false);
  const reopenTimer = useRef<ReturnType<typeof setTimeout>>();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { user, isAnonymous } = useAuth();
  const ownerRef = useRef(user?.id);
  ownerRef.current = user?.id;
  const { isLoaded } = useChatSync({ enabled: false });
  const { pinnedIds, setPinned, refreshPins } = useChatPins();
  const navigate = useNavigate();
  const sessions = useArcStore(state => state.chatSessions);
  const currentId = useArcStore(state => state.currentSessionId);
  const isSyncing = useArcStore(state => state.isSyncing);
  const sidebarId = useId();
  const preferenceKey = `arc_chat_sidebar_docked:${user?.id ?? 'guest'}`;
  const docked = desktop && panel === 'docked';
  const clearDismiss = () => clearTimeout(dismissTimer.current);
  const hide = () => { clearDismiss(); setPanel('hidden'); suppressEdge.current = true; clearTimeout(reopenTimer.current); reopenTimer.current = setTimeout(() => { suppressEdge.current = false; }, 350); try { localStorage.setItem(preferenceKey, 'false'); } catch { /* Device preference is optional. */ } };
  const dock = () => { clearDismiss(); setPanel('docked'); try { localStorage.setItem(preferenceKey, 'true'); } catch { /* Device preference is optional. */ } };
  useEffect(() => {
    const media = window.matchMedia(desktopQuery);
    const update = () => { setDesktop(media.matches); if (!media.matches) setPanel('hidden'); };
    update(); media.addEventListener('change', update);
    return () => { media.removeEventListener('change', update); clearTimeout(dismissTimer.current); clearTimeout(reopenTimer.current); };
  }, []);
  useEffect(() => {
    let saved = false;
    try { saved = localStorage.getItem(preferenceKey) === 'true'; } catch { /* Device preference is optional. */ }
    setPanel(desktop && saved ? 'docked' : 'hidden');
  }, [desktop, preferenceKey]);
  useEffect(() => { onDockChange(docked); return () => onDockChange(false); }, [docked, onDockChange]);
  useEffect(() => {
    if (desktop || gestureBlocked) return;
    let gesture: { x: number; y: number; dx: number; dy: number; inside: boolean; locked: boolean } | null = null;
    const reset = () => { gesture = null; };
    const start = (event: TouchEvent) => {
      reset();
      if (event.touches.length !== 1 || window.getSelection()?.toString()) return;
      const target = event.target as HTMLElement | null;
      const inside = !!target?.closest('[data-chat-history-sidebar="true"]');
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="menu"], [role="alertdialog"]') || (!inside && target?.closest('button, a, [role="dialog"]'))) return;
      const touch = event.touches[0];
      if (!touch || (panel === 'hidden' && touch.clientX > Math.min(window.innerWidth / 3, 140) && touch.clientX < window.innerWidth - 40)) return;
      gesture = { x: touch.clientX, y: touch.clientY, dx: 0, dy: 0, inside, locked: false };
    };
    const move = (event: TouchEvent) => {
      if (!gesture || event.touches.length !== 1) { reset(); return; }
      const touch = event.touches[0];
      gesture.dx = touch.clientX - gesture.x; gesture.dy = touch.clientY - gesture.y;
      if (!gesture.locked) {
        if (Math.abs(gesture.dy) > 28 && Math.abs(gesture.dy) > Math.abs(gesture.dx)) { reset(); return; }
        if (Math.abs(gesture.dx) < 28 || Math.abs(gesture.dx) < Math.abs(gesture.dy) * 1.5) return;
        gesture.locked = true;
      }
      if (event.cancelable) event.preventDefault();
    };
    const end = () => {
      if (!gesture) return;
      const action = sidebarSwipeAction({ startX: gesture.x, dx: gesture.dx, dy: gesture.dy, width: window.innerWidth, open: panel === 'hover', inside: gesture.inside });
      reset();
      if (action === 'dashboard') onOpenDashboard();
      else if (action) setPanel(action === 'open' ? 'hover' : 'hidden');
    };
    window.addEventListener('touchstart', start, { passive: true });
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', end, { passive: true });
    window.addEventListener('touchcancel', reset, { passive: true });
    return () => { window.removeEventListener('touchstart', start); window.removeEventListener('touchmove', move); window.removeEventListener('touchend', end); window.removeEventListener('touchcancel', reset); };
  }, [desktop, gestureBlocked, panel, onOpenDashboard]);
  const dismissHover = () => {
    clearDismiss();
    dismissTimer.current = setTimeout(function dismiss() {
      if (document.querySelector('[role="menu"], [role="alertdialog"]')) { dismissTimer.current = setTimeout(dismiss, 350); return; }
      setPanel(current => current === 'hover' ? 'hidden' : current);
    }, 350);
  };
  const syncChats = async () => {
    if (syncInFlight.current || isSyncing || !user || isAnonymous) return;
    syncInFlight.current = true; setSyncing(true);
    try {
      if (!navigator.onLine) throw new Error('Offline');
      await Promise.all([useArcStore.getState().syncFromSupabase(), refreshPins()]);
      if (ownerRef.current !== user.id) return;
      if (!useArcStore.getState().isOnline) throw new Error('Sync failed');
      toast.success('Chats synced.');
    } catch { toast.error('Could not sync chats. Your saved chats are still available.'); }
    finally { syncInFlight.current = false; setSyncing(false); }
  };
  const visibleSessions = user && !isAnonymous && isLoaded ? sessions.filter(session => !session.persistenceOwnerId || session.persistenceOwnerId === user.id) : [];
  const orderedSessions = [...visibleSessions].sort((a, b) => Number(pinnedIds.includes(b.id)) - Number(pinnedIds.includes(a.id)));
  const closeAfterNavigate = () => { if (!docked) setPanel('hidden'); };
  const content = <>
    <header className="relative flex h-11 shrink-0 items-center justify-center px-10">
      <Button type="button" variant="ghost" size="icon" className="absolute left-0 h-11 w-11 rounded-full" aria-label="Sync chats" aria-busy={syncing || isSyncing} disabled={syncing || isSyncing || !user || isAnonymous} onClick={() => void syncChats()}><RefreshCw className={syncing || isSyncing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /></Button>
      {docked ? <h2 className="text-center text-2xl font-semibold">Chats</h2> : <SheetTitle className="text-center text-2xl font-semibold">Chats</SheetTitle>}
      {docked && <Button type="button" variant="ghost" size="icon" className="absolute right-0 h-11 w-11 rounded-full" aria-label="Hide sidebar" onClick={() => { hide(); triggerRef.current?.focus(); }}><PanelLeftClose className="h-4 w-4" /></Button>}
    </header>
    <Button variant="outline" className="mt-3 shrink-0 justify-start rounded-full" onClick={() => { closeAfterNavigate(); onOpenDashboard(); }}><LayoutDashboard className="h-4 w-4" />Open dashboard</Button>
    <Button variant="ghost" className="shrink-0 justify-start rounded-full" onClick={() => { closeAfterNavigate(); navigate('/dashboard?tab=chats'); }}>Show all chats</Button>
    <nav aria-label="Saved chats" className="mt-3 min-h-0 min-w-0 w-full flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
      {visibleSessions.length === 0 && <p className="p-2 text-sm text-muted-foreground">{user && !isAnonymous && !isLoaded ? 'Loading chats…' : 'No saved chats yet.'}</p>}
      {orderedSessions.slice(0, 20).map(session => <div key={session.id} className="flex w-full min-w-0 items-center gap-1">
        <button type="button" aria-current={session.id === currentId ? 'page' : undefined} className="mb-1 flex min-h-11 min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-full px-3 py-2 text-left text-sm text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { useArcStore.getState().loadSession(session.id); closeAfterNavigate(); navigate(`/chat/${encodeURIComponent(session.id)}`); }}>
          {pinnedIds.includes(session.id) && <Pin aria-label="Pinned" className="h-3 w-3 shrink-0" />}<MessageSquare aria-hidden="true" className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1 truncate">{session.title || 'Untitled chat'}</span>
        </button>
        <ChatRowActions title={session.title} onRename={title => useArcStore.getState().updateSessionTitle(session.id, title)} pinned={pinnedIds.includes(session.id)} onPin={value => setPinned(session.id, value)} onDelete={() => useArcStore.getState().deleteSession(session.id)} />
      </div>)}
    </nav>
  </>;
  const trigger = <Button ref={triggerRef} variant="outline" size="icon" className="rounded-full glass-shimmer" aria-label={docked ? 'Hide sidebar' : 'Show chat history sidebar'} title="Chats" aria-expanded={panel !== 'hidden'} aria-controls={sidebarId} onClick={desktop ? () => { if (docked) hide(); else if (panel === 'hover') dock(); else setPanel('hover'); } : undefined}><History className="h-4 w-4" /></Button>;
  const insetStyle = { paddingTop: 'calc(max(env(safe-area-inset-top, 0px), var(--arcai-safe-area-top, 0px)) + 1rem)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)', paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))' };
  return <>
    {desktop && panel === 'hidden' && createPortal(<div aria-hidden="true" className="fixed bottom-0 left-0 top-0 z-40 w-2" onPointerEnter={() => { if (!suppressEdge.current) { clearDismiss(); setPanel('hover'); } }} onPointerLeave={() => { suppressEdge.current = false; }} />, document.body)}
    <Sheet modal={!desktop} open={panel === 'hover'} onOpenChange={value => setPanel(value ? 'hover' : 'hidden')}>
      {desktop ? trigger : <SheetTrigger asChild>{trigger}</SheetTrigger>}
      <SheetContent id={sidebarId} closeIcon={desktop ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />} closeLabel={desktop ? 'Dock sidebar' : 'Hide chat history sidebar'} onCloseControl={desktop ? dock : undefined} aria-describedby={undefined} data-chat-history-sidebar="true" side="left" className="flex min-w-0 w-[min(88vw,360px)] flex-col overflow-hidden px-4 lg:w-80" style={insetStyle} onPointerEnter={clearDismiss} onPointerLeave={desktop ? dismissHover : undefined} onOpenAutoFocus={desktop ? event => event.preventDefault() : undefined} onCloseAutoFocus={desktop ? event => event.preventDefault() : undefined}>
        {content}
      </SheetContent>
    </Sheet>
    {docked && createPortal(<aside id={sidebarId} aria-label="Chats sidebar" className="fixed bottom-0 left-0 top-0 z-50 flex w-80 flex-col border-r border-border bg-background px-4 shadow-lg" style={insetStyle}>{content}</aside>, document.body)}
  </>;
}
