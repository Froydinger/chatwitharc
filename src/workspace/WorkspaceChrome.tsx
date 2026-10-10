import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { MessageCircle, Plus, Code2, LayoutGrid, Image, FileText, Database, Bell, Users, Settings, ChevronRight, Menu, X, Search, MoreHorizontal, Share, PanelRight, PanelLeftOpen, PanelLeftClose, CircleHelp, CircleGauge, LogIn, Pin } from 'lucide-react';
import { ChatRowActions } from '@/components/ChatRowActions';
import { useWorkspaceSidebar } from './useWorkspaceSidebar';
export type WorkspaceSection = 'chat' | 'build' | 'apps' | 'images' | 'canvases' | 'memory' | 'reminders' | 'shared' | 'settings';
export const workspaceNav = [
  { id: 'chat', label: 'Chat', icon: MessageCircle }, { id: 'build', label: 'Build', icon: Code2 },
  { id: 'apps', label: 'Apps', icon: LayoutGrid }, { id: 'images', label: 'Images', icon: Image },
  { id: 'canvases', label: 'Canvases', icon: FileText }, { id: 'memory', label: 'Memory', icon: Database },
  { id: 'reminders', label: 'Reminders', icon: Bell }, { id: 'shared', label: 'Shared chats', icon: Users },
] as const;
export function ArcMark({ className = '' }: { className?: string }) {
  return <span className={`ws-logo ${className}`} role="img" aria-label="Arc" />;
}
export function IconButton({ label, children, onClick, className = '', disabled = false }: { label: string; children: ReactNode; onClick?: () => void; className?: string; disabled?: boolean }) {
  return <button type="button" className={`ws-icon-button ${className}`} aria-label={label} title={label} onClick={onClick} disabled={disabled}>{children}</button>;
}
export function WorkspaceDialog({ title, description, open, onOpenChange, children, wide = false }: { title: string; description?: string; open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode; wide?: boolean }) {
  const opener = useRef<HTMLElement | null>(null);
  const content = useRef<HTMLDivElement>(null);
  const visible = (element: HTMLElement | null): element is HTMLElement => {
    if (!element?.isConnected || !element.matches('button, a[href], input, textarea, select, [tabindex]')
      || element.closest('[aria-hidden="true"], [hidden], [inert]') || element.matches(':disabled')) return false;
    for (let parent: HTMLElement | null = element; parent; parent = parent.parentElement) {
      const style = window.getComputedStyle(parent);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  };
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="ws-modal-overlay" /><Dialog.Content ref={content} className={`workspace-ui ws-modal ${wide ? 'ws-modal-wide' : ''}`} aria-describedby={description ? "workspace-dialog-description" : undefined}
    onOpenAutoFocus={() => { const active = document.activeElement; opener.current = active instanceof HTMLElement && !content.current?.contains(active) ? active : null; }}
    onCloseAutoFocus={event => {
      event.preventDefault();
      // Search can originate in an undocked sidebar or a now-unmounted menu.
      // Restore to a visible control after Radix removes its focus scope.
      requestAnimationFrame(() => {
        const fallback = ['.ws-desktop-sidebar-trigger', '.ws-mobile-menu', '.ws-header [aria-label="More workspace options"]']
          .map(selector => document.querySelector<HTMLElement>(selector)).find(visible);
        (visible(opener.current) ? opener.current : fallback)?.focus();
      });
    }}>
    <div className="ws-modal-heading"><div><Dialog.Title>{title}</Dialog.Title>{description && <Dialog.Description id="workspace-dialog-description">{description}</Dialog.Description>}</div><Dialog.Close asChild><button className="ws-icon-button" aria-label="Close dialog"><X /></button></Dialog.Close></div>{children}
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
export function WorkspaceChrome({ section, onNavigate, onNewChat, recent, currentId, onOpenChat, onAllChats, allChatsActive = false, folders = [], onPinChat, onRenameChat, onMoveChat, onDeleteChat, title, children, canvasOpen, onCanvasToggle, onShare, onSearch, onUsage, onInfo, onAccount, accountId, accountName = 'Account', headerActions }: {
  section: WorkspaceSection; onNavigate: (id: WorkspaceSection) => void; onNewChat: () => void;
  recent: { id: string; title: string; work?: boolean; pinned?: boolean; folderId?: string }[]; currentId?: string | null; onOpenChat: (id: string) => void;
  onAllChats?: () => void; allChatsActive?: boolean; folders?: { id: string; name: string }[];
  onPinChat?: (id: string, pinned: boolean) => Promise<void>; onRenameChat?: (id: string, title: string) => Promise<void>;
  onMoveChat?: (id: string, folderId: string | null) => Promise<void>; onDeleteChat?: (id: string) => Promise<void>;
  title: string; children: ReactNode; canvasOpen?: boolean; onCanvasToggle?: () => void; onShare?: () => void; onSearch?: () => void;
  onUsage: () => void; onInfo: () => void; onAccount: () => void; accountId?: string; accountName?: string; headerActions?: ReactNode;
}) {
  const [drawer, setDrawer] = useState(false);
  const sidebar = useWorkspaceSidebar(accountId);
  const { closePeek, desktop } = sidebar;
  useEffect(() => { setDrawer(false); closePeek(); }, [section, currentId, allChatsActive, closePeek]);
  useEffect(() => { if (desktop) setDrawer(false); }, [desktop]);
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      document.documentElement.style.setProperty('--ws-viewport-height', `${viewport?.height ?? window.innerHeight}px`);
      document.documentElement.style.setProperty('--ws-viewport-top', `${viewport?.offsetTop ?? 0}px`);
    };
    update();
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); onSearch?.(); }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'o') { event.preventDefault(); onNewChat(); }
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, [onNewChat, onSearch]);
  const closeNavigation = () => { setDrawer(false); closePeek(); };
  const navigate = (id: WorkspaceSection) => { closeNavigation(); onNavigate(id); };
  const searchWorkspace = () => { closeNavigation(); onSearch?.(); };
  const nav = <>
    <div className="ws-brand"><ArcMark /><span>Arc</span><button className="ws-brand-search ws-icon-button" aria-label="Search workspace" onClick={searchWorkspace}><Search /></button>
      {desktop && <IconButton className="ws-sidebar-dock-control" label={sidebar.panel === 'docked' ? 'Hide sidebar' : 'Dock sidebar'} onClick={sidebar.panel === 'docked' ? sidebar.hide : sidebar.dock}>{sidebar.panel === 'docked' ? <PanelLeftClose /> : <PanelLeftOpen />}</IconButton>}
    </div>
    <button className="ws-new-chat" onClick={() => { closeNavigation(); onNewChat(); }}><Plus /><span>New chat</span><span className="ws-shortcut">⌘ O</span></button>
    <nav className="ws-nav" aria-label="Workspace navigation">{workspaceNav.map(item => <button key={item.id} className={section === item.id && !allChatsActive ? 'is-active' : ''} aria-current={section === item.id && !allChatsActive ? 'page' : undefined} onClick={() => navigate(item.id)}><item.icon /><span>{item.label}</span></button>)}</nav>
    <div className="ws-history-nav">{onAllChats && <button type="button" className={allChatsActive ? 'is-active' : ''} aria-current={allChatsActive ? 'page' : undefined} onClick={() => { closeNavigation(); onAllChats(); }}><MessageCircle /><span>All chats</span></button>}</div>
    <div className="ws-recent-heading"><span>Recent</span><button className="ws-icon-button" aria-label="Find chats" onClick={searchWorkspace}><Search /></button></div>
    <nav className="ws-recent" aria-label="Recent conversations">{recent.map(item => <div key={item.id} className={`ws-recent-row${section === 'chat' && !allChatsActive && currentId === item.id ? ' is-active' : ''}`}>
      <button type="button" className="ws-recent-open" aria-current={section === 'chat' && !allChatsActive && currentId === item.id ? 'page' : undefined} onClick={() => { closeNavigation(); onOpenChat(item.id); }}><MessageCircle /><span>{item.title || 'Untitled chat'}</span>{item.pinned && <Pin className="ws-recent-pin" aria-label="Pinned" />}{item.work && <span className="ws-recent-work">Work</span>}</button>
      {onPinChat && onDeleteChat && <ChatRowActions workspaceUI title={item.title} pinned={!!item.pinned} folders={folders} folderId={item.folderId}
        onPin={value => onPinChat(item.id, value)} onDelete={() => onDeleteChat(item.id)}
        onRename={onRenameChat ? value => onRenameChat(item.id, value) : undefined}
        onMove={onMoveChat ? folderId => onMoveChat(item.id, folderId) : undefined} />}
    </div>)}{!recent.length && <p className="ws-no-recent">Your conversations will appear here.</p>}</nav>
    <div className="ws-sidebar-bottom"><button className={section === 'settings' ? 'is-active' : ''} onClick={() => navigate('settings')}><Settings /><span>Settings</span></button>
      <button className="ws-account" onClick={() => { closeNavigation(); onAccount(); }}><span className="ws-avatar">{accountName.split(' ').map(s => s[0]).slice(0, 2).join('') || 'A'}</span><span>{accountName}<small>Account settings</small></span><ChevronRight /></button>
    </div>
  </>;
  return <div className="workspace-ui ws-frame ws-live" data-section={section} data-canvas-open={canvasOpen || false} data-sidebar-interactive={desktop} data-sidebar-state={sidebar.panel}>
    <aside id="workspace-desktop-navigation" className="ws-sidebar" ref={sidebar.sidebarRef} aria-label="Workspace sidebar" aria-hidden={desktop && sidebar.panel === 'hidden' ? true : undefined} onPointerEnter={sidebar.clearDismiss} onPointerLeave={desktop && sidebar.panel === 'peek' ? sidebar.dismissPeek : undefined} onFocusCapture={sidebar.clearDismiss} onBlurCapture={desktop && sidebar.panel === 'peek' ? sidebar.dismissPeek : undefined}>{nav}</aside>
    {desktop && sidebar.panel === 'hidden' && <div className="ws-sidebar-peek-edge" aria-hidden="true" onPointerEnter={() => sidebar.peek()} />}
    <Dialog.Root open={drawer} onOpenChange={setDrawer}><Dialog.Portal><Dialog.Overlay className="ws-drawer-overlay" /><Dialog.Content className="workspace-ui ws-mobile-sidebar" aria-describedby={undefined}><Dialog.Title className="sr-only">Workspace navigation</Dialog.Title><Dialog.Close className="ws-drawer-close ws-icon-button" aria-label="Close navigation"><X /></Dialog.Close>{nav}</Dialog.Content></Dialog.Portal></Dialog.Root>
    <div className="ws-stage"><header className="ws-header" aria-label="Workspace toolbar"><button className="ws-mobile-menu ws-icon-button" aria-label="Open navigation" onClick={() => setDrawer(true)}><Menu /></button>
      {desktop && sidebar.panel !== 'docked' && <button type="button" className="ws-icon-button ws-desktop-sidebar-trigger" ref={sidebar.triggerRef} aria-label={sidebar.panel === 'peek' ? 'Dock sidebar' : 'Show sidebar'} title={sidebar.panel === 'peek' ? 'Dock sidebar' : 'Show sidebar'} aria-expanded={sidebar.panel === 'peek'} aria-controls="workspace-desktop-navigation" onClick={() => sidebar.panel === 'peek' ? sidebar.dock() : sidebar.peek(true)}><PanelLeftOpen /></button>}
      <div className="ws-header-spacer" aria-hidden="true" />
      <div className="ws-header-actions">{headerActions}{onCanvasToggle && <IconButton label={canvasOpen ? 'Close canvas' : 'Open canvas'} onClick={onCanvasToggle}><PanelRight /></IconButton>}{onShare && <IconButton label="Share or export chat" onClick={onShare}><Share /></IconButton>}
        <DropdownMenu.Root><DropdownMenu.Trigger asChild><button className="ws-icon-button" aria-label="More workspace options"><MoreHorizontal /></button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="workspace-ui ws-menu" align="end" sideOffset={8}>
          <DropdownMenu.Item onSelect={onUsage}><CircleGauge /> Usage</DropdownMenu.Item><DropdownMenu.Item onSelect={onInfo}><CircleHelp /> About Arc</DropdownMenu.Item><DropdownMenu.Separator /><DropdownMenu.Item onSelect={onAccount}><LogIn /> Account settings</DropdownMenu.Item>
        </DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
      </div></header><main className="ws-main" aria-label={title}>{children}</main></div>
  </div>;
}
