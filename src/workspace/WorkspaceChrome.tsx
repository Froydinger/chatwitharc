import { useEffect, useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { MessageCircle, Plus, Code2, LayoutGrid, Image, FileText, Database, Bell, Users, Settings, ChevronRight, Menu, X, Search, MoreHorizontal, Share, PanelRight, CircleHelp, CircleGauge, LogIn } from 'lucide-react';
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
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="ws-modal-overlay" /><Dialog.Content className={`workspace-ui ws-modal ${wide ? 'ws-modal-wide' : ''}`} aria-describedby={description ? "workspace-dialog-description" : undefined}>
    <div className="ws-modal-heading"><div><Dialog.Title>{title}</Dialog.Title>{description && <Dialog.Description id="workspace-dialog-description">{description}</Dialog.Description>}</div><Dialog.Close asChild><button className="ws-icon-button" aria-label="Close dialog"><X /></button></Dialog.Close></div>{children}
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
export function WorkspaceChrome({ section, onNavigate, onNewChat, recent, currentId, onOpenChat, title, children, canvasOpen, onCanvasToggle, onShare, onSearch, onUsage, onInfo, onAccount, accountName = 'Account', subtitle, headerActions }: {
  section: WorkspaceSection; onNavigate: (id: WorkspaceSection) => void; onNewChat: () => void;
  recent: { id: string; title: string; work?: boolean }[]; currentId?: string | null; onOpenChat: (id: string) => void;
  title: string; children: ReactNode; canvasOpen?: boolean; onCanvasToggle?: () => void; onShare?: () => void; onSearch?: () => void;
  onUsage: () => void; onInfo: () => void; onAccount: () => void; accountName?: string; subtitle?: string; headerActions?: ReactNode;
}) {
  const [drawer, setDrawer] = useState(false);
  useEffect(() => { setDrawer(false); }, [section, currentId]);
  useEffect(() => {
    const update = () => document.documentElement.style.setProperty('--ws-viewport-height', `${window.visualViewport?.height ?? window.innerHeight}px`);
    update(); window.visualViewport?.addEventListener('resize', update); window.addEventListener('resize', update);
    return () => { window.visualViewport?.removeEventListener('resize', update); window.removeEventListener('resize', update); };
  }, []);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); onSearch?.(); }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'o') { event.preventDefault(); onNewChat(); }
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, [onNewChat, onSearch]);
  const navigate = (id: WorkspaceSection) => { setDrawer(false); onNavigate(id); };
  const nav = <>
    <div className="ws-brand"><ArcMark /><span>Arc</span><button className="ws-brand-search ws-icon-button" aria-label="Search workspace" onClick={onSearch}><Search /></button></div>
    <button className="ws-new-chat" onClick={() => { setDrawer(false); onNewChat(); }}><Plus /><span>New chat</span><span className="ws-shortcut">⌘ O</span></button>
    <nav className="ws-nav" aria-label="Workspace navigation">{workspaceNav.map(item => <button key={item.id} className={section === item.id ? 'is-active' : ''} aria-current={section === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}><item.icon /><span>{item.label}</span></button>)}</nav>
    <div className="ws-recent-heading"><span>Recent</span><button className="ws-icon-button" aria-label="Find chats" onClick={onSearch}><Search /></button></div>
    <nav className="ws-recent" aria-label="Recent conversations">{recent.map(item => <button key={item.id} className={section === 'chat' && currentId === item.id ? 'is-active' : ''} onClick={() => { setDrawer(false); onOpenChat(item.id); }}><MessageCircle /><span>{item.title || 'Untitled chat'}</span>{item.work && <span className="ws-recent-work">Work</span>}</button>)}{!recent.length && <p className="ws-no-recent">Your conversations will appear here.</p>}</nav>
    <div className="ws-sidebar-bottom"><button className={section === 'settings' ? 'is-active' : ''} onClick={() => navigate('settings')}><Settings /><span>Settings</span></button>
      <button className="ws-account" onClick={onAccount}><span className="ws-avatar">{accountName.split(' ').map(s => s[0]).slice(0, 2).join('') || 'A'}</span><span>{accountName}<small>Account settings</small></span><ChevronRight /></button>
    </div>
  </>;
  return <div className="workspace-ui ws-frame ws-live" data-section={section} data-canvas-open={canvasOpen || false}>
    <aside className="ws-sidebar">{nav}</aside>
    <Dialog.Root open={drawer} onOpenChange={setDrawer}><Dialog.Portal><Dialog.Overlay className="ws-drawer-overlay" /><Dialog.Content className="workspace-ui ws-mobile-sidebar" aria-describedby={undefined}><Dialog.Title className="sr-only">Workspace navigation</Dialog.Title><Dialog.Close className="ws-drawer-close ws-icon-button" aria-label="Close navigation"><X /></Dialog.Close>{nav}</Dialog.Content></Dialog.Portal></Dialog.Root>
    <div className="ws-stage"><header className="ws-header"><button className="ws-mobile-menu ws-icon-button" aria-label="Open navigation" onClick={() => setDrawer(true)}><Menu /></button><div className="ws-title"><h1>{title}</h1>{subtitle && <span>{subtitle}</span>}</div>
      <div className="ws-header-actions">{headerActions}{onCanvasToggle && <IconButton label={canvasOpen ? 'Close canvas' : 'Open canvas'} onClick={onCanvasToggle}><PanelRight /></IconButton>}{onShare && <IconButton label="Share or export chat" onClick={onShare}><Share /></IconButton>}
        <DropdownMenu.Root><DropdownMenu.Trigger asChild><button className="ws-icon-button" aria-label="More workspace options"><MoreHorizontal /></button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="workspace-ui ws-menu" align="end" sideOffset={8}>
          <DropdownMenu.Item onSelect={onUsage}><CircleGauge /> Usage</DropdownMenu.Item><DropdownMenu.Item onSelect={onInfo}><CircleHelp /> About Arc</DropdownMenu.Item><DropdownMenu.Separator /><DropdownMenu.Item onSelect={onAccount}><LogIn /> Account settings</DropdownMenu.Item>
        </DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
      </div></header><main className="ws-main">{children}</main></div>
  </div>;
}
