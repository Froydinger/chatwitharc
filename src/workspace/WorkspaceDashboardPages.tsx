import type { ReactNode } from 'react';
import { ChatRowActions } from '@/components/ChatRowActions';
import { PrivateImage } from '@/components/PrivateImage';
import './workspace-pages.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useChatPins } from '@/hooks/useChatPins';
import type { ContextBlock } from '@/hooks/useContextBlocks';
import type { ChatFolder, ChatSession } from '@/store/useArcStore';
import {
  Activity, ArrowDownToLine, ArrowLeft, ArrowRight, Brain, CalendarClock, Check,
  ChevronLeft, ChevronRight, FileCode2, FileText, Folder,
  FolderPlus, Image as ImageIcon, Layers3, LoaderCircle, MessageSquare, MoreHorizontal,
  Pin, PinOff, Plus, Search, Settings2, Smartphone, Sparkles, Trash2,
  Upload, Users, X,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type WorkspaceDashboardTab = 'overview' | 'chats' | 'apps' | 'images' | 'canvases' | 'memory';

export interface WorkspaceAppProject {
  id: string;
  title: string;
  prompt: string;
  favicon_label: string | null;
  netlify_url: string | null;
  netlify_subdomain: string | null;
  updated_at: string;
  created_at: string;
  version: number;
  versions?: Record<string, unknown> | null;
}

export interface WorkspaceImage {
  url: string;
  prompt: string;
  sessionId: string;
  messageId: string;
  timestamp: Date;
}

export interface WorkspaceCanvas {
  id: string;
  type: 'code' | 'writing' | 'app';
  content: string;
  language?: string;
  sessionId?: string;
  sessionTitle?: string;
  timestamp: Date;
  label?: string;
}

type PageFrameProps = {
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
};

function PageFrame({ title, description, actions, children }: PageFrameProps) {
  return (
    <section className="workspace-dashboard-page" data-workspace-page>
      <header className="workspace-dashboard-page-intro">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        {actions && <div className="workspace-dashboard-page-actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

type PageControlProps = {
  current: number;
  total: number;
  onChange: (page: number) => void;
};

function PageControls({ current, total, onChange }: PageControlProps) {
  if (total <= 1) return null;
  return (
    <nav className="workspace-dashboard-page-controls" aria-label="Pages">
      <button type="button" onClick={() => onChange(current - 1)} disabled={current <= 1} aria-label="Previous page"><ChevronLeft /></button>
      <span>Page {current} of {total}</span>
      <button type="button" onClick={() => onChange(current + 1)} disabled={current >= total} aria-label="Next page"><ChevronRight /></button>
    </nav>
  );
}

type WorkspaceOverviewModel = {
  tab: 'overview';
  greeting: string;
  displayName: string;
  chatsLoading: boolean;
  recentChats: ChatSession[];
  stats: Array<{ label: string; value: number | string; tab: WorkspaceDashboardTab }>;
  timeAgo: (value: Date | string | null | undefined) => string;
  onNewChat: () => void;
  onOpenChat: (id: string) => void;
  onDeleteChat: (id: string) => Promise<void> | void;
  onRenameChat: (id: string, title: string) => Promise<void>;
  onOpenLibrary: (tab: WorkspaceDashboardTab) => void;
  usageSnapshot: ReactNode;
  onOpenPlan: () => void;
  onOpenReminders: () => void;
  onOpenShared: () => void;
  onOpenStatus: () => void;
};

function OverviewPage({ model }: { model: WorkspaceOverviewModel }) {
  const { pinnedIds, setPinned } = useChatPins();
  return (
    <PageFrame
      title={model.displayName ? model.greeting + ', ' + model.displayName + '.' : model.greeting + '.'}
      description="A current view of your conversations and saved work."
      actions={<Button onClick={model.onNewChat} className="workspace-dashboard-primary-action"><Plus />New chat</Button>}
    >
      <div className="workspace-dashboard-overview-layout">
        <section className="workspace-dashboard-section">
          <div className="workspace-dashboard-section-heading">
            <div><h3>Recent chats</h3><p>Your latest conversations</p></div>
            <Button variant="outline" onClick={() => model.onOpenLibrary('chats')}>All chats <ArrowRight /></Button>
          </div>
          {model.chatsLoading ? (
            <div className="workspace-dashboard-records-loading" role="status">Loading chats…</div>
          ) : model.recentChats.length === 0 ? (
            <div className="workspace-dashboard-empty">
              <MessageSquare aria-hidden="true" />
              <h4>No saved chats yet</h4>
              <p>Start a conversation and it will appear here.</p>
              <Button onClick={model.onNewChat}><Plus />New chat</Button>
            </div>
          ) : (
            <div className="workspace-dashboard-overview-chats">
              {model.recentChats.map((session) => (
                <article className="workspace-dashboard-overview-chat" key={session.id}>
                  <button type="button" className="workspace-dashboard-overview-chat-open" onClick={() => model.onOpenChat(session.id)}>
                    <span className="workspace-dashboard-overview-chat-icon"><MessageSquare /></span>
                    <span className="workspace-dashboard-overview-chat-copy">
                      <strong>{session.title || 'Untitled chat'}</strong>
                      <small>{model.timeAgo(session.lastMessageAt || session.createdAt)}{session.isWork ? ' · Work' : ' · Chat'}</small>
                      <span>{session.messages[session.messages.length - 1]?.content || (session.messageCount ? session.messageCount + ' messages' : 'Open conversation')}</span>
                    </span>
                    <ArrowRight aria-hidden="true" />
                  </button>
                  {pinnedIds.includes(session.id) && <Pin className="workspace-dashboard-pinned" aria-label="Pinned" />}
                  <ChatRowActions title={session.title} pinned={pinnedIds.includes(session.id)} onPin={pinned => setPinned(session.id, pinned)} onRename={title => model.onRenameChat(session.id, title)} onDelete={() => model.onDeleteChat(session.id)} />
                </article>
              ))}
            </div>
          )}
        </section>

        <aside className="workspace-dashboard-overview-aside">
          <section className="workspace-dashboard-section workspace-dashboard-usage">
            <div className="workspace-dashboard-section-heading">
              <div><h3>Usage</h3><p>Current plan and feature allowances</p></div>
              <Button variant="outline" onClick={model.onOpenPlan}>Plan</Button>
            </div>
            {model.usageSnapshot}
          </section>
          <div className="workspace-dashboard-shortcuts">
            <button type="button" onClick={model.onOpenReminders}><CalendarClock /><span><strong>Reminders</strong><small>Scheduled prompts</small></span><ArrowRight /></button>
            <button type="button" onClick={model.onOpenShared}><Users /><span><strong>Shared chats</strong><small>Conversations with others</small></span><ArrowRight /></button>
            <button type="button" onClick={model.onOpenStatus}><Activity /><span><strong>System status</strong><small>Open service status</small></span><ArrowRight /></button>
          </div>
        </aside>
      </div>

      <section className="workspace-dashboard-section workspace-dashboard-library">
        <div className="workspace-dashboard-section-heading"><div><h3>Your library</h3><p>Open saved work from your account</p></div></div>
        <div className="workspace-dashboard-library-grid">
          {model.stats.map((stat) => (
            <button type="button" key={stat.tab} onClick={() => model.onOpenLibrary(stat.tab)}>
              <span>{stat.label}</span><strong>{stat.value}</strong><ArrowRight aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>
    </PageFrame>
  );
}

type WorkspaceChatsModel = {
  tab: 'chats';
  isLoaded: boolean;
  sessions: ChatSession[];
  currentSessionId: string | null;
  folders: ChatFolder[];
  search: string;
  onSearchChange: (value: string) => void;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  expandedFolders: Record<string, boolean>;
  onToggleFolder: (id: string) => void;
  isCreatingFolder: boolean;
  isSavingFolder: boolean;
  newFolderName: string;
  onFolderNameChange: (value: string) => void;
  onCreateFolder: () => void;
  onCancelCreateFolder: () => void;
  onStartCreateFolder: () => void;
  onDeleteFolder: (id: string) => void;
  onPinFolder: (id: string, value: boolean) => void;
  onMoveChat: (chatId: string, folderId: string | null) => void;
  onOpenChat: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => Promise<void> | void;
  onRenameChat: (id: string, title: string) => Promise<void>;
};

function ChatsPage({ model }: { model: WorkspaceChatsModel }) {
  const { pinnedIds, setPinned } = useChatPins();
  const ungrouped = model.sessions.filter((session) => !session.folderId);

  const chatRow = (session: ChatSession) => (
    <article className="workspace-dashboard-chat-row" key={session.id} data-current={session.id === model.currentSessionId || undefined}>
      <button type="button" className="workspace-dashboard-chat-open" onClick={() => model.onOpenChat(session.id)}>
        <span className="workspace-dashboard-chat-icon">{session.isWork ? <Sparkles /> : <MessageSquare />}</span>
        <span className="workspace-dashboard-chat-copy">
          <strong>{session.title || 'Untitled chat'}</strong>
          <small>{session.isWork ? 'Work' : 'Chat'} · {session.messageCount ?? session.messages.length} messages</small>
        </span>
        {pinnedIds.includes(session.id) && <Pin className="workspace-dashboard-pinned" aria-label="Pinned" />}
        <ArrowRight aria-hidden="true" />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="workspace-dashboard-icon-action" aria-label={'Move ' + (session.title || 'chat') + ' to a folder'}><Folder /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {session.folderId && <DropdownMenuItem onSelect={() => model.onMoveChat(session.id, null)}>Remove from folder</DropdownMenuItem>}
          {model.folders.length > 0 && session.folderId && <DropdownMenuSeparator />}
          {model.folders.map((folder) => <DropdownMenuItem key={folder.id} disabled={session.folderId === folder.id} onSelect={() => model.onMoveChat(session.id, folder.id)}><Folder />{folder.name}</DropdownMenuItem>)}
          {model.folders.length === 0 && <DropdownMenuItem disabled>No folders created</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
      <ChatRowActions title={session.title} pinned={pinnedIds.includes(session.id)} onPin={(value) => setPinned(session.id, value)} onRename={(title) => model.onRenameChat(session.id, title)} onDelete={() => model.onDeleteChat(session.id)} />
    </article>
  );

  return (
    <PageFrame title="Chats" description="Find, organize, and return to your conversations." actions={
      <>
        <Button variant="outline" onClick={model.onStartCreateFolder}><FolderPlus />New folder</Button>
        <Button onClick={model.onNewChat} className="workspace-dashboard-primary-action"><Plus />New chat</Button>
      </>
    }>
      <div className="workspace-dashboard-toolbar">
        <label className="workspace-dashboard-search"><Search /><Input aria-label="Search chats" value={model.search} onChange={(event) => model.onSearchChange(event.target.value)} placeholder="Search chats" /></label>
      </div>
      {model.isCreatingFolder && (
        <form className="workspace-dashboard-folder-create" onSubmit={(event) => { event.preventDefault(); model.onCreateFolder(); }}>
          <Folder aria-hidden="true" />
          <Input autoFocus aria-label="Folder name" value={model.newFolderName} onChange={(event) => model.onFolderNameChange(event.target.value)} placeholder="Folder name" maxLength={64} disabled={model.isSavingFolder} />
          <Button type="button" variant="ghost" onClick={model.onCancelCreateFolder} disabled={model.isSavingFolder}><X />Cancel</Button>
          <Button type="submit" disabled={model.isSavingFolder || !model.newFolderName.trim()}>{model.isSavingFolder ? <LoaderCircle className="animate-spin" /> : <Check />}{model.isSavingFolder ? 'Creating…' : 'Create folder'}</Button>
        </form>
      )}
      {!model.isLoaded ? (
        <div className="workspace-dashboard-records-loading" role="status">Loading chats…</div>
      ) : model.sessions.length === 0 && model.folders.length === 0 ? (
        <div className="workspace-dashboard-empty">
          <MessageSquare aria-hidden="true" /><h4>{model.search ? 'No matching chats' : 'No chats yet'}</h4>
          <p>{model.search ? 'Try another title or clear your search.' : 'Start a conversation to see it here.'}</p>
          {!model.search && <Button onClick={model.onNewChat}><Plus />New chat</Button>}
        </div>
      ) : (
        <div className="workspace-dashboard-chat-groups">
          {[...model.folders].sort((a, b) => Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned)) || a.sortOrder - b.sortOrder).map((folder) => {
            const rows = model.sessions.filter((session) => session.folderId === folder.id);
            const expanded = model.expandedFolders[folder.id] ?? false;
            return (
              <section key={folder.id} className="workspace-dashboard-folder">
                <div className="workspace-dashboard-folder-heading">
                  <button type="button" className="workspace-dashboard-folder-toggle" onClick={() => model.onToggleFolder(folder.id)} aria-expanded={expanded}>
                    <Folder /><span><strong>{folder.name}</strong><small>{rows.length} {rows.length === 1 ? 'chat' : 'chats'}</small></span>{folder.isPinned && <Pin className="workspace-dashboard-pinned" aria-label="Pinned folder" />}
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="workspace-dashboard-icon-action" aria-label={'Folder options for ' + folder.name}><MoreHorizontal /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => model.onPinFolder(folder.id, !folder.isPinned)}>{folder.isPinned ? <PinOff /> : <Pin />}{folder.isPinned ? 'Unpin folder' : 'Pin folder'}</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive" onSelect={() => model.onDeleteFolder(folder.id)}><Trash2 />Delete folder</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {expanded && <div className="workspace-dashboard-folder-rows">{rows.length ? rows.map(chatRow) : <p className="workspace-dashboard-muted-record">This folder is empty.</p>}</div>}
              </section>
            );
          })}
          <section className="workspace-dashboard-ungrouped">
            {model.sessions.length > 0 && <h3>{model.search ? 'Matching chats' : 'Chats without a folder'}</h3>}
            {ungrouped.length ? ungrouped.slice((model.page - 1) * 12, model.page * 12).map(chatRow) : (
              model.sessions.length === 0 && model.folders.length > 0 ? <p className="workspace-dashboard-muted-record">No chats match this search.</p> : null
            )}
          </section>
        </div>
      )}
      <PageControls current={model.page} total={model.totalPages} onChange={model.onPageChange} />
    </PageFrame>
  );
}

type AppSettingsModel = {
  app: WorkspaceAppProject | null;
  title: string;
  description: string;
  hideBadge: boolean;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onBadgeChange: (show: boolean) => void;
  onSave: () => void;
};

type WorkspaceAppsModel = {
  tab: 'apps';
  loading: boolean;
  error: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  apps: WorkspaceAppProject[];
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onRetry: () => void;
  openingAppId: string | null;
  deletingAppId: string | null;
  onCreate: () => void;
  onOpen: (app: WorkspaceAppProject) => void;
  onDelete: (app: WorkspaceAppProject) => void;
  onEditSettings: (app: WorkspaceAppProject) => void;
  settings: AppSettingsModel;
  timeAgo: (value: Date | string | null | undefined) => string;
};

function safePreviewUrl(app: WorkspaceAppProject): string | null {
  const raw = app.netlify_url || (app.netlify_subdomain ? 'https://' + app.netlify_subdomain + '.askarc.chat' : '');
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function AppsPage({ model }: { model: WorkspaceAppsModel }) {
  const appsOnPage = model.apps.slice((model.page - 1) * 12, model.page * 12);
  return (
    <PageFrame title="Apps" description="Open and manage the apps you have built with Arc." actions={<Button onClick={model.onCreate} className="workspace-dashboard-primary-action"><Plus />Create app</Button>}>
      <div className="workspace-dashboard-toolbar">
        <label className="workspace-dashboard-search"><Search /><Input aria-label="Search apps" value={model.search} onChange={(event) => model.onSearchChange(event.target.value)} placeholder="Search your apps" /></label>
      </div>
      {model.error && <div className="workspace-dashboard-error" role="alert"><p>{model.error}</p><Button variant="outline" onClick={model.onRetry} disabled={model.loading}>Try again</Button></div>}
      {model.loading ? (
        <div className="workspace-dashboard-records-loading" role="status">Loading apps…</div>
      ) : model.error ? null : model.apps.length === 0 ? (
        <div className="workspace-dashboard-empty">
          <Smartphone aria-hidden="true" /><h4>{model.search ? 'No matching apps' : 'No apps yet'}</h4>
          <p>{model.search ? 'Try a different app name.' : 'Apps you build will appear here.'}</p>
          {!model.search && <Button onClick={model.onCreate}><Plus />Create app</Button>}
        </div>
      ) : (
        <>
          <div className="workspace-dashboard-app-grid">
            {appsOnPage.map((app) => {
              const previewUrl = safePreviewUrl(app);
              return (
                <article className="workspace-dashboard-app-card" key={app.id}>
                  <div className="workspace-dashboard-app-open">
                    <div className="workspace-dashboard-app-preview" aria-label={previewUrl ? 'Preview of ' + app.title : 'No published preview'}>
                      {previewUrl ? (
                        <iframe title={app.title + ' preview'} src={previewUrl} loading="lazy" sandbox="allow-scripts" tabIndex={-1} />
                      ) : (
                        <div className="workspace-dashboard-app-preview-empty"><Smartphone /><span>Draft preview</span></div>
                      )}
                    </div>
                    <button type="button" className="workspace-dashboard-app-copy" onClick={() => model.onOpen(app)} disabled={model.openingAppId !== null}>
                      <div className="workspace-dashboard-app-title"><Smartphone /><h3>{app.title || 'Untitled app'}</h3><span>v{app.version || 1}</span></div>
                      <p>{app.prompt?.trim() || 'Open this project to continue building.'}</p>
                    </button>
                  </div>
                  <footer className="workspace-dashboard-app-footer">
                    <span>{app.netlify_subdomain ? app.netlify_subdomain + '.askarc.chat' : 'Draft'} · {model.timeAgo(app.updated_at || app.created_at)}</span>
                    <div>
                      <Button type="button" variant="ghost" size="icon" aria-label={'Edit settings for ' + app.title} onClick={() => model.onEditSettings(app)}><Settings2 /></Button>
                      <Button type="button" variant="ghost" size="icon" aria-label={'Delete ' + app.title} onClick={() => model.onDelete(app)} disabled={model.deletingAppId === app.id}>{model.deletingAppId === app.id ? <LoaderCircle className="animate-spin" /> : <Trash2 />}</Button>
                      <Button type="button" variant="outline" onClick={() => model.onOpen(app)} disabled={model.openingAppId !== null}>{model.openingAppId === app.id ? <LoaderCircle className="animate-spin" /> : null}{model.openingAppId === app.id ? 'Opening' : 'Open'} <ArrowRight /></Button>
                    </div>
                  </footer>
                </article>
              );
            })}
            <button type="button" className="workspace-dashboard-create-card" onClick={model.onCreate}>
              <Plus /><strong>Create an app</strong><span>Start a new project with Arc Builder.</span>
            </button>
          </div>
          <PageControls current={model.page} total={model.totalPages} onChange={model.onPageChange} />
        </>
      )}
      <Dialog open={Boolean(model.settings.app)} onOpenChange={model.settings.onOpenChange}>
        <DialogContent className="workspace-dashboard-settings-dialog">
          <DialogHeader><DialogTitle>App settings and branding</DialogTitle><DialogDescription>Update the project name, search description, and Arc badge.</DialogDescription></DialogHeader>
          <div className="workspace-dashboard-form-stack">
            <div><Label htmlFor="workspace-app-title">App name</Label><Input id="workspace-app-title" value={model.settings.title} onChange={(event) => model.settings.onTitleChange(event.target.value)} disabled={model.settings.saving} /></div>
            <div><div className="workspace-dashboard-form-label"><Label htmlFor="workspace-app-description">SEO description</Label><span>{model.settings.description.length}/155</span></div><Textarea id="workspace-app-description" value={model.settings.description} maxLength={160} onChange={(event) => model.settings.onDescriptionChange(event.target.value.slice(0, 160))} rows={3} disabled={model.settings.saving} /></div>
            <label className="workspace-dashboard-switch-row"><span><strong>Show “Built with ArcAI” badge</strong><small>Display the Arc badge on the live project.</small></span><Switch checked={!model.settings.hideBadge} onCheckedChange={model.settings.onBadgeChange} disabled={model.settings.saving} /></label>
            {model.settings.app?.netlify_url && <a className="workspace-dashboard-app-link" href={model.settings.app.netlify_url} target="_blank" rel="noopener noreferrer">Open published app <ArrowRight /></a>}
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => model.settings.onOpenChange(false)} disabled={model.settings.saving}>Cancel</Button><Button type="button" onClick={model.settings.onSave} disabled={model.settings.saving || !model.settings.title.trim()}>{model.settings.saving && <LoaderCircle className="animate-spin" />}Save settings</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </PageFrame>
  );
}

type WorkspaceImagesModel = {
  tab: 'images';
  loading: boolean;
  error: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  images: WorkspaceImage[];
  totalCount: number | null;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  hasMore: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
  viewerIndex: number | null;
  onSetViewerIndex: (index: number | null) => void;
  onDownload: (image: WorkspaceImage) => void;
  onOpenChat: (id: string) => void;
};

function ImagesPage({ model }: { model: WorkspaceImagesModel }) {
  const current = model.viewerIndex === null ? null : model.images[model.viewerIndex] ?? null;
  return (
    <PageFrame title="Images" description="Browse images saved from your conversations.">
      <div className="workspace-dashboard-toolbar">
        <label className="workspace-dashboard-search"><Search /><Input aria-label="Search images" value={model.search} onChange={(event) => model.onSearchChange(event.target.value)} placeholder="Search images" /></label>
        {model.totalCount !== null && <span className="workspace-dashboard-count">{model.totalCount} saved</span>}
      </div>
      {model.error && <div className="workspace-dashboard-error" role="alert"><p>{model.error}</p><Button variant="outline" onClick={model.onRetry}>Try again</Button></div>}
      {model.viewerIndex !== null && current ? (
        <div className="workspace-dashboard-image-viewer">
          <div className="workspace-dashboard-viewer-toolbar"><Button type="button" variant="ghost" onClick={() => model.onSetViewerIndex(null)}><ArrowLeft />Back to images</Button><span>{model.viewerIndex + 1} of {model.images.length}</span></div>
          <div className="workspace-dashboard-image-large"><PrivateImage src={current.url} alt={current.prompt || 'Generated image'} className="max-h-[70vh] w-full object-contain" /></div>
          <div className="workspace-dashboard-image-detail"><h3>{current.prompt || 'Generated image'}</h3><p>{current.timestamp.toLocaleString()}</p><div><Button variant="outline" onClick={() => model.onDownload(current)}><ArrowDownToLine />Download</Button><Button variant="outline" onClick={() => model.onOpenChat(current.sessionId)}><MessageSquare />Open conversation</Button></div></div>
          <div className="workspace-dashboard-image-thumbnails">{model.images.map((image, index) => <button key={image.messageId + ':' + index} type="button" aria-label={'View image ' + (index + 1)} aria-current={index === model.viewerIndex} onClick={() => model.onSetViewerIndex(index)}><PrivateImage src={image.url} alt="" thumbnail className="h-full w-full object-cover" /></button>)}</div>
        </div>
      ) : model.loading && model.images.length === 0 ? (
        <div className="workspace-dashboard-records-loading" role="status">Loading images…</div>
      ) : model.error && model.images.length === 0 ? null : model.images.length === 0 ? (
        <div className="workspace-dashboard-empty"><ImageIcon aria-hidden="true" /><h4>{model.search ? 'No matching images' : 'Your gallery is empty'}</h4><p>{model.search ? 'Try a different search term.' : 'Images saved from your chats will appear here.'}</p></div>
      ) : (
        <>
          <div className="workspace-dashboard-image-grid">
            {model.images.slice((model.page - 1) * 12, model.page * 12).map((image, index) => {
              const globalIndex = (model.page - 1) * 12 + index;
              return (
                <button key={image.messageId + ':' + globalIndex} type="button" className="workspace-dashboard-image-card" onClick={() => model.onSetViewerIndex(globalIndex)}>
                  <PrivateImage src={image.url} alt={image.prompt || 'Generated image'} thumbnail className="workspace-dashboard-image-media" />
                  <span><strong>{image.prompt || 'Generated image'}</strong><small>{image.timestamp.toLocaleDateString()}</small></span>
                </button>
              );
            })}
          </div>
          <PageControls current={model.page} total={model.totalPages} onChange={model.onPageChange} />
        </>
      )}
      {model.hasMore && model.viewerIndex === null && <div className="workspace-dashboard-load-more"><Button type="button" variant="outline" onClick={model.onLoadMore} disabled={model.loading}>{model.loading && <LoaderCircle className="animate-spin" />}Load more from history</Button></div>}
    </PageFrame>
  );
}

type WorkspaceCanvasesModel = {
  tab: 'canvases';
  loading: boolean;
  error: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  canvases: WorkspaceCanvas[];
  selected: WorkspaceCanvas | null;
  onSelect: (item: WorkspaceCanvas | null) => void;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  hasMore: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
  onOpenCanvas: (item: WorkspaceCanvas) => void;
  onOpenChat: (sessionId: string) => void;
  onCreateCanvas: () => void;
  creatingCanvas: boolean;
  timeAgo: (value: Date | string | null | undefined) => string;
  deployedView: ReactNode;
  detailTab: 'canvas' | 'deployed';
  onDetailTab: (tab: 'canvas' | 'deployed') => void;
};

function CanvasesPage({ model }: { model: WorkspaceCanvasesModel }) {
  return (
    <PageFrame title="Canvases" description="Continue with code and writing saved from your conversations.">
      {model.selected ? (
        <div className="workspace-dashboard-canvas-detail">
          <div className="workspace-dashboard-viewer-toolbar">
            <Button type="button" variant="ghost" onClick={() => { model.onSelect(null); model.onDetailTab('canvas'); }}><ArrowLeft />Back to canvases</Button>
            <div><Button variant="outline" onClick={() => model.onOpenChat(model.selected?.sessionId || '')}><MessageSquare />Open conversation</Button><Button onClick={() => { if (model.selected) model.onOpenCanvas(model.selected); }}><FileText />Open canvas</Button></div>
          </div>
          <header><span>{model.selected.type === 'code' ? <FileCode2 /> : <FileText />}</span><div><h3>{model.selected.label || 'Untitled canvas'}</h3><p>{model.selected.type === 'code' ? model.selected.language || 'Code' : 'Writing'} · {model.selected.sessionTitle || 'Conversation'}</p></div></header>
          <nav className="workspace-dashboard-canvas-tabs" aria-label="Canvas details">
            <button type="button" aria-current={model.detailTab === 'canvas'} onClick={() => model.onDetailTab('canvas')}>Canvas</button>
            <button type="button" aria-current={model.detailTab === 'deployed'} onClick={() => model.onDetailTab('deployed')}>Live sites</button>
          </nav>
          {model.detailTab === 'canvas' ? <pre className="workspace-dashboard-canvas-content">{model.selected.content}</pre> : <div className="workspace-dashboard-deployed-content">{model.deployedView}</div>}
        </div>
      ) : (
        <>
          <div className="workspace-dashboard-toolbar">
            <label className="workspace-dashboard-search"><Search /><Input aria-label="Search canvases" value={model.search} onChange={(event) => model.onSearchChange(event.target.value)} placeholder="Search code and writing" /></label>
          </div>
          {model.error && <div className="workspace-dashboard-error" role="alert"><p>{model.error}</p><Button variant="outline" onClick={model.onRetry}>Try again</Button></div>}
          {model.loading && model.canvases.length === 0 ? (
            <div className="workspace-dashboard-records-loading" role="status">Loading canvases…</div>
          ) : model.error && model.canvases.length === 0 ? null : (
            <>
              {model.canvases.length === 0 && <div className="workspace-dashboard-empty"><Layers3 aria-hidden="true" /><h4>{model.search ? 'No matching canvases' : 'No canvases yet'}</h4><p>{model.search ? 'Try another search term or load more history.' : 'Save code or writing from a conversation to find it here.'}</p></div>}
              <div className="workspace-dashboard-canvas-grid">
                {model.canvases.slice((model.page - 1) * 12, model.page * 12).map((item, index) => (
                  <article className="workspace-dashboard-canvas-card" key={item.sessionId + ':' + item.id + ':' + index}>
                    <button type="button" className="workspace-dashboard-canvas-open" onClick={() => model.onSelect(item)}>
                      <span className="workspace-dashboard-canvas-icon">{item.type === 'code' ? <FileCode2 /> : <FileText />}</span>
                      <h3>{item.label || (item.type === 'code' ? 'Code canvas' : 'Writing canvas')}</h3>
                      <p className={item.type === 'code' ? 'is-code' : undefined}>{item.content.trim() || 'This canvas is empty.'}</p>
                      <small>From {item.sessionTitle || 'Conversation'} · {model.timeAgo(item.timestamp)}</small>
                    </button>
                    <footer><Button variant="outline" onClick={() => model.onOpenChat(item.sessionId || '')}><MessageSquare />Conversation</Button><Button onClick={() => model.onOpenCanvas(item)}><ArrowRight />Open canvas</Button></footer>
                  </article>
                ))}
                <button type="button" className="workspace-dashboard-create-card workspace-dashboard-new-canvas" onClick={model.onCreateCanvas} disabled={model.creatingCanvas}><Plus /><strong>{model.creatingCanvas ? 'Opening canvas…' : 'New canvas'}</strong><span>Start a blank canvas in a new conversation.</span></button>
              </div>
              <PageControls current={model.page} total={model.totalPages} onChange={model.onPageChange} />
            </>
          )}
          {model.hasMore && <div className="workspace-dashboard-load-more"><Button type="button" variant="outline" onClick={model.onLoadMore} disabled={model.loading}>{model.loading && <LoaderCircle className="animate-spin" />}Load more from history</Button></div>}
        </>
      )}
    </PageFrame>
  );
}

type WorkspaceMemoryModel = {
  tab: 'memory';
  loading: boolean;
  error: string | null;
  summary: ContextBlock | null;
  isAdding: boolean;
  newContent: string;
  onNewContent: (value: string) => void;
  onStartAdd: () => void;
  onAdd: () => void;
  onCancelAdd: () => void;
  editing: boolean;
  editContent: string;
  onEditContent: (value: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  saving: boolean;
  onImport: (file: File) => void;
  onExport: () => void;
  onRetry: () => void;
};

function MemoryPage({ model }: { model: WorkspaceMemoryModel }) {
  return (
    <PageFrame title="Memory" description="Review and update Arc’s single living summary.">
      <section className="workspace-dashboard-memory">
        <div className="workspace-dashboard-memory-actions">
          <Button variant="outline" onClick={model.onExport} disabled={!model.summary}><ArrowDownToLine />Export summary</Button>
          <label className="workspace-dashboard-file-button"><Upload />Import summary<input type="file" accept=".json,application/json" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) model.onImport(file); event.currentTarget.value = ''; }} /></label>
          {!model.isAdding && <Button onClick={model.onStartAdd} className="workspace-dashboard-primary-action"><Plus />Add to summary</Button>}
        </div>
        {model.error && <div className="workspace-dashboard-error" role="alert"><p>{model.error}</p><Button variant="outline" onClick={model.onRetry}>Try again</Button></div>}
        {model.isAdding && (
          <div className="workspace-dashboard-memory-editor">
            <Label htmlFor="workspace-memory-add">Information to merge</Label>
            <Textarea id="workspace-memory-add" autoFocus value={model.newContent} onChange={(event) => model.onNewContent(event.target.value)} placeholder="Tell Arc something you want included in the living summary." />
            <div><Button type="button" variant="ghost" onClick={model.onCancelAdd} disabled={model.saving}>Cancel</Button><Button type="button" onClick={model.onAdd} disabled={model.saving || !model.newContent.trim()}>{model.saving && <LoaderCircle className="animate-spin" />}Merge into summary</Button></div>
          </div>
        )}
        {model.loading && !model.editing && <div className="workspace-dashboard-records-loading" role="status">Loading memory…</div>}
        {!model.loading && !model.summary && !model.editing && !model.error ? (
          <div className="workspace-dashboard-empty"><Brain aria-hidden="true" /><h4>Your living memory is empty</h4><p>Add a note or import an existing summary.</p></div>
        ) : null}
        {(model.summary || model.editing) && (
          <article className="workspace-dashboard-memory-summary">
            <header><span><Brain /></span><div><h3>Arc’s living summary</h3><p>{model.summary?.updated_at ? 'Updated ' + new Date(model.summary.updated_at).toLocaleString() : model.summary ? 'Update time unavailable' : 'Saved copy could not be loaded; your draft is still here.'}</p></div>{model.summary && !model.editing && <Button variant="outline" onClick={model.onStartEdit}><Settings2 />Edit</Button>}</header>
            {model.editing ? (
              <div className="workspace-dashboard-memory-editor">
                <Label htmlFor="workspace-memory-edit">Living summary</Label>
                <Textarea id="workspace-memory-edit" autoFocus value={model.editContent} onChange={(event) => model.onEditContent(event.target.value)} />
                <div><Button type="button" variant="ghost" onClick={model.onCancelEdit} disabled={model.saving}>Cancel</Button><Button type="button" onClick={model.onSave} disabled={model.saving || !model.editContent.trim()}>{model.saving && <LoaderCircle className="animate-spin" />}Save summary</Button></div>
              </div>
            ) : model.summary ? <p className="workspace-dashboard-memory-copy">{model.summary.content}</p> : null}
          </article>
        )}
      </section>
    </PageFrame>
  );
}

export type WorkspaceDashboardModel =
  | WorkspaceOverviewModel
  | WorkspaceChatsModel
  | WorkspaceAppsModel
  | WorkspaceImagesModel
  | WorkspaceCanvasesModel
  | WorkspaceMemoryModel;

export function WorkspaceDashboardPage({ model }: { model: WorkspaceDashboardModel }) {
  switch (model.tab) {
    case 'overview': return <OverviewPage model={model} />;
    case 'chats': return <ChatsPage model={model} />;
    case 'apps': return <AppsPage model={model} />;
    case 'images': return <ImagesPage model={model} />;
    case 'canvases': return <CanvasesPage model={model} />;
    case 'memory': return <MemoryPage model={model} />;
  }
}
