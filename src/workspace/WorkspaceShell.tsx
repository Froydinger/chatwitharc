import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight, MessageCircle, Music, Search } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useArcStore } from '@/store/useArcStore';
import { useCanvasStore } from '@/store/useCanvasStore';
import { useAccentStore } from '@/store/useAccentStore';
import { IconButton, WorkspaceChrome, WorkspaceDialog, type WorkspaceSection } from './WorkspaceChrome';
import { getConversationCanvas, isCurrentConversationRoute } from './conversationCanvas';
import { useWorkspaceTheme } from './useWorkspaceTheme';
import { WORKSPACE_CANVAS_OPEN_EVENT, type WorkspaceCanvasOpenIntent } from './workspaceCanvasOpenIntent';
const PlanUsageBreakdown = lazy(() => import('@/components/PlanUsageBreakdown').then(module => ({ default: module.PlanUsageBreakdown })));
const destination: Record<WorkspaceSection, string> = {
  chat: '/', build: '/build', apps: '/dashboard?tab=apps', images: '/dashboard?tab=images',
  canvases: '/dashboard?tab=canvases', memory: '/dashboard?tab=memories',
  reminders: '/tasks', shared: '/shared', settings: '/dashboard/settings',
};
function sectionFor(path: string, search: string): WorkspaceSection {
  if (path.startsWith('/build')) return 'build';
  if (path === '/tasks') return 'reminders';
  if (path.startsWith('/shared')) return 'shared';
  if (path === '/dashboard/settings') return 'settings';
  if (path === '/dashboard') {
    const tab = new URLSearchParams(search).get('tab');
    return ({ apps: 'apps', images: 'images', canvases: 'canvases', memory: 'memory', memories: 'memory' } as Record<string, WorkspaceSection>)[tab ?? ''] ?? 'chat';
  }
  return 'chat';
}
export function WorkspaceShell({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const userId = user?.id;
  const location = useLocation();
  const navigate = useNavigate();
  const sessions = useArcStore(state => state.chatSessions);
  const currentId = useArcStore(state => state.currentSessionId);
  const messages = useArcStore(state => state.messages);
  const syncedUserId = useArcStore(state => state.syncedUserId);
  const canvasOpen = useCanvasStore(state => state.isOpen);
  const theme = useAccentStore(state => state.themeMode);
  const setTheme = useAccentStore(state => state.setThemeMode);
  const [dialog, setDialog] = useState<'about' | 'usage' | 'search' | null>(null);
  const [search, setSearch] = useState('');
  const pendingCanvasOpen = useRef<WorkspaceCanvasOpenIntent | null>(null);
  const chatRoute = location.pathname === '/' || location.pathname.startsWith('/chat/');
  const section = sectionFor(location.pathname, location.search);
  // Unowned legacy cache entries are visible only after this account's sync.
  const ownedSessions = sessions.filter(session => session.persistenceOwnerId === user?.id
    || (!session.persistenceOwnerId && syncedUserId === user?.id));
  const current = isCurrentConversationRoute(location.pathname, currentId)
    ? ownedSessions.find(session => session.id === currentId) : undefined;
  const conversationCanvas = getConversationCanvas(current);
  const titles: Record<WorkspaceSection, string> = {
    chat: location.pathname === '/dashboard' ? 'Your workspace' : current?.title || 'New chat',
    build: 'Build', apps: 'Apps', images: 'Images', canvases: 'Canvases', memory: 'Memory',
    reminders: 'Reminders', shared: 'Shared chats', settings: 'Settings',
  };
  useWorkspaceTheme(theme);
  // Direct links into Tasks/Build need the same saved-history read as Chat. This
  // deliberately does not run title generation or introduce a second chat hook.
  useEffect(() => {
    const state = useArcStore.getState();
    if (userId && state.syncedUserId !== userId && !state.isSyncing) {
      void state.syncFromSupabase().catch(error => console.warn('Workspace history sync failed.', error));
    }
  }, [userId]);
  useEffect(() => { setDialog(null); }, [location.pathname, location.search]);
  useEffect(() => {
    const receiveCanvasOpen = (event: Event) => {
      const detail = (event as CustomEvent<WorkspaceCanvasOpenIntent>).detail;
      if (!detail?.sessionId || !useArcStore.getState().chatSessions.some(session => session.id === detail.sessionId)) return;
      pendingCanvasOpen.current = detail;
    };
    window.addEventListener(WORKSPACE_CANVAS_OPEN_EVENT, receiveCanvasOpen);
    return () => window.removeEventListener(WORKSPACE_CANVAS_OPEN_EVENT, receiveCanvasOpen);
  }, []);
  useEffect(() => {
    const intent = pendingCanvasOpen.current;
    if (!intent || intent.sessionId !== currentId || !current?.isHydrated
      || !isCurrentConversationRoute(location.pathname, currentId)) return;

    // MobileChatApp closes and rehydrates the canvas as it commits a session
    // switch. Run after that effect and re-check ownership against the latest
    // store state, so a saved artifact from another chat can never bleed in.
    const timeout = window.setTimeout(() => {
      if (pendingCanvasOpen.current !== intent) return;
      const state = useArcStore.getState();
      const target = state.chatSessions.find(session => session.id === intent.sessionId);
      const owned = target && (target.persistenceOwnerId === user?.id
        || (!target.persistenceOwnerId && state.syncedUserId === user?.id));
      if (!owned || state.currentSessionId !== intent.sessionId) {
        pendingCanvasOpen.current = null;
        return;
      }

      const canvas = useCanvasStore.getState();
      if (intent.kind === 'new') canvas.hydrateFromSession('', 'writing');
      else canvas.hydrateFromSession(intent.content, intent.type, intent.language);
      canvas.reopenCanvas();
      pendingCanvasOpen.current = null;
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [currentId, current?.isHydrated, location.pathname, user?.id, syncedUserId]);
  useEffect(() => {
    const openUsage = () => setDialog('usage');
    window.addEventListener('workspace-open-usage', openUsage);
    return () => window.removeEventListener('workspace-open-usage', openUsage);
  }, []);

  const flushCanvas = () => {
    if (!chatRoute || !current || !conversationCanvas) return;
    const canvas = useCanvasStore.getState();
    if (canvas.isOpen && canvas.content.trim()) {
      void useArcStore.getState().updateSessionCanvasContent(current.id, canvas.content)
        .catch(error => console.warn('Canvas save before navigation failed.', error));
    }
  };
  const go = (path: string) => { flushCanvas(); navigate(path); };
  const newChat = () => {
    // On a mounted chat, retain its existing new-chat handler and state effects.
    if (chatRoute && !window.dispatchEvent(new Event('workspace-new-chat', { cancelable: true }))) return;
    flushCanvas();
    const id = useArcStore.getState().createNewSession();
    navigate(`/chat/${encodeURIComponent(id)}`);
  };
  const openChat = (id: string) => {
    if (!ownedSessions.some(session => session.id === id)) return;
    flushCanvas();
    useArcStore.getState().loadSession(id);
    navigate(`/chat/${encodeURIComponent(id)}`);
    setDialog(null);
  };
  const toggleCanvas = () => {
    if (!chatRoute || !current || !conversationCanvas) return;
    const canvas = useCanvasStore.getState();
    if (canvas.isOpen) { flushCanvas(); canvas.closeCanvas(); }
    else {
      // openWithContent can preserve a different global same-type artifact.
      // Hydrate from this conversation only before reopening the real panel.
      canvas.hydrateFromSession(conversationCanvas.content, conversationCanvas.type, conversationCanvas.language);
      canvas.reopenCanvas();
    }
  };
  return <WorkspaceChrome section={section} title={titles[section]}
    onNavigate={id => go(destination[id])} onNewChat={newChat}
    recent={ownedSessions.slice(0, 20).map(session => ({ id: session.id, title: session.title, work: session.isWork }))}
    currentId={currentId} onOpenChat={openChat} onSearch={() => setDialog('search')}
    onUsage={() => setDialog('usage')} onInfo={() => setDialog('about')}
    onAccount={() => go('/dashboard/settings')}
    headerActions={chatRoute ? <IconButton label="Music player" onClick={() => window.dispatchEvent(new Event('workspace-open-music'))}><Music /></IconButton> : undefined}
    accountName={profile?.display_name || user?.email?.split('@')[0] || 'Account'}
    canvasOpen={chatRoute && !!conversationCanvas && canvasOpen}
    onCanvasToggle={chatRoute && conversationCanvas ? toggleCanvas : undefined}
    onShare={chatRoute && current && messages.length ? () => window.dispatchEvent(new Event('workspace-share-chat')) : undefined}>
    <div className="ws-live-content">{children}</div>
    <WorkspaceDialog title="Your usage" open={dialog === 'usage'} onOpenChange={open => !open && setDialog(null)}>
      <div className="ws-dialog-body"><Suspense fallback={<p>Loading usage…</p>}><PlanUsageBreakdown /></Suspense></div>
    </WorkspaceDialog>
    <WorkspaceDialog title="About Arc" open={dialog === 'about'} onOpenChange={open => !open && setDialog(null)}>
      <div className="ws-dialog-body">
        <p>Ask, reflect, and create with Arc.</p>
        <div className="ws-theme-choices" role="group" aria-label="Appearance">
          {(['light', 'dark', 'system'] as const).map(value => <button key={value} type="button" className="ws-secondary-button" aria-pressed={theme === value} onClick={() => setTheme(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}
        </div>
        <div className="ws-dialog-actions"><button className="ws-secondary-button" onClick={() => go('/docs')}>Documentation</button><button className="ws-secondary-button" onClick={() => go('/support')}>Support</button></div>
      </div>
    </WorkspaceDialog>
    <WorkspaceDialog title="Search your chats" open={dialog === 'search'} onOpenChange={open => !open && setDialog(null)}>
      <div className="ws-search-field"><Search /><input autoFocus placeholder="Search chat titles…" aria-label="Search chat titles" value={search} onChange={event => setSearch(event.target.value)} /></div>
      <div className="ws-search-results">{ownedSessions.filter(session => session.title.toLowerCase().includes(search.toLowerCase())).slice(0, 30).map(session =>
        <button key={session.id} onClick={() => openChat(session.id)}><MessageCircle /><span><strong>{session.title}</strong><small>{session.isWork ? 'Work' : 'Chat'}</small></span><ChevronRight /></button>)}
        <button className="ws-secondary-button" onClick={() => go('/dashboard?tab=chats')}>All chats and history</button>
      </div>
    </WorkspaceDialog>
  </WorkspaceChrome>;
}
