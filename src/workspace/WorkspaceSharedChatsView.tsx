import { useRef, useState, type MouseEvent } from 'react';
import { AlertCircle, ArrowUpRight, Loader2, Plus, Trash2, Users } from 'lucide-react';
import { WorkspaceOrganizerDialog } from './WorkspaceOrganizerDialog';
import './workspace-reminders-shared.css';

export interface WorkspaceSharedChat {
  id: string;
  title: string;
  owner_id: string;
  updated_at: string;
}

interface WorkspaceSharedChatsViewProps {
  chats: WorkspaceSharedChat[];
  userId: string;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  creating: boolean;
  newTitle: string;
  onTitleChange: (value: string) => void;
  onCreate: () => Promise<void>;
  deletingId: string | null;
  onDelete: (chat: WorkspaceSharedChat, event: MouseEvent) => Promise<void>;
  onOpen: (id: string) => void;
}

/** Own records and membership records still come from the existing controller. */
export function WorkspaceSharedChatsView(props: WorkspaceSharedChatsViewProps) {
  const [showCreate, setShowCreate] = useState(false);
  const createTriggerRef = useRef<HTMLButtonElement>(null);
  const headerCreateRef = useRef<HTMLButtonElement>(null);
  return <>
    <section className="workspace-organizer-page" aria-labelledby="workspace-shared-heading">
      <div className="workspace-organizer-intro">
        <div><span className="workspace-organizer-eyebrow">BETTER TOGETHER</span><h2 id="workspace-shared-heading">Shared chats</h2><p>A place to think things through with your team.</p></div>
        <button ref={headerCreateRef} className="ws-primary-button" onClick={event => { createTriggerRef.current = event.currentTarget; setShowCreate(true); }}><Plus />Create chat</button>
      </div>

      {props.error && <div className="workspace-organizer-error" role="alert"><AlertCircle /><div><strong>Couldn't load shared chats</strong><p>{props.error}</p></div><button className="ws-secondary-button" onClick={props.onRetry} disabled={props.loading}>Try again</button></div>}
      {props.loading && !props.chats.length ? <div className="workspace-organizer-loading" role="status"><Loader2 />Loading shared chats…</div>
        : !props.error && !props.chats.length ? <div className="workspace-organizer-empty">
          <Users /><h3>Bring people into the conversation.</h3>
          <p>Create a shared chat, then invite up to five people. Mention @Arc for answers and web search.</p>
          <button className="ws-primary-button" onClick={event => { createTriggerRef.current = event.currentTarget; setShowCreate(true); }}><Plus />Create shared chat</button>
        </div> : null}

      {!!props.chats.length && <div className="workspace-organizer-records" aria-label="Shared chats" aria-busy={props.loading}>
        {props.chats.map(chat => <article className="workspace-organizer-record workspace-shared-record" key={chat.id}>
          <button className="workspace-shared-record-open" onClick={() => props.onOpen(chat.id)}>
            <Users className="workspace-organizer-record-icon" aria-hidden="true" />
            <span className="workspace-organizer-record-copy"><strong>{chat.title}</strong><span className="workspace-organizer-record-meta">{chat.owner_id === props.userId ? 'Owner' : 'Member'} · Updated {new Date(chat.updated_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span></span>
            <ArrowUpRight className="workspace-shared-open-icon" aria-hidden="true" />
          </button>
          {chat.owner_id === props.userId && <button className="ws-icon-button" aria-label={`Delete ${chat.title}`} title="Delete shared chat" disabled={props.deletingId !== null} onClick={event => void props.onDelete(chat, event)}>{props.deletingId === chat.id ? <Loader2 className="workspace-organizer-spinner" /> : <Trash2 />}</button>}
        </article>)}
      </div>}
    </section>

    <WorkspaceOrganizerDialog title="Create shared chat" description="Start a conversation, then invite people to join." open={showCreate} onOpenChange={open => { if (!props.creating) setShowCreate(open); }} returnFocusRef={createTriggerRef} fallbackFocusRef={headerCreateRef} busy={props.creating}>
      <form className="ws-dialog-body workspace-organizer-form" onSubmit={event => { event.preventDefault(); if (!props.creating) void props.onCreate(); }}>
        <label htmlFor="workspace-shared-title">Chat name<input id="workspace-shared-title" autoFocus required value={props.newTitle} onChange={event => props.onTitleChange(event.target.value)} placeholder="What are you working on together?" disabled={props.creating} /></label>
        <p>Up to six people, including you. Mention @Arc for answers and web search; use your main Arc chat for other tools.</p>
        <div className="ws-dialog-actions"><button type="button" className="ws-secondary-button" onClick={() => setShowCreate(false)} disabled={props.creating}>Cancel</button><button type="submit" className="ws-primary-button" disabled={props.creating || !props.newTitle.trim()}>{props.creating ? 'Creating…' : 'Create chat'}</button></div>
      </form>
    </WorkspaceOrganizerDialog>
  </>;
}
