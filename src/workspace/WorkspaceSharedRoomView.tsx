import { Fragment, useId, useRef, type RefObject } from "react";
import { ArrowLeft, ArrowUp, Ban, Flag, Loader2, Mail, RefreshCw, ShieldOff, Trash2, UserPlus, Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageBubble } from "@/components/MessageBubble";
import type { Message } from "@/store/useArcStore";
import { ArcMark, IconButton } from "./WorkspaceChrome";
import { WorkspaceOrganizerDialog } from "./WorkspaceOrganizerDialog";
import "./workspace-shared-room.css";

export interface WorkspaceSharedRoomMessage {
  id: string;
  name: string;
  avatarUrl: string | null;
  createdAt: string;
  isMine: boolean;
  isArc: boolean;
  message: Message;
}

interface WorkspaceSharedRoomProps {
  title?: string;
  loading: boolean;
  error: string | null;
  members: { user_id: string; display_name?: string; avatar_url?: string | null; role: string }[];
  pendingInvites: { id: string; email: string }[];
  messages: WorkspaceSharedRoomMessage[];
  userId: string;
  canReport: boolean;
  isOwner: boolean;
  blockedUserIds: Set<string>;
  lastAssistantId?: string;
  sending: boolean;
  aiThinking: boolean;
  text: string;
  inviteEmail: string;
  settingsOpen: boolean;
  busyAction: string | null;
  scrollRef: RefObject<HTMLDivElement>;
  textareaRef: RefObject<HTMLTextAreaElement>;
  onBack: () => void;
  onRetry: () => void;
  onSettingsOpenChange: (open: boolean) => void;
  onTextChange: (text: string) => void;
  onInviteEmailChange: (email: string) => void;
  onMentionArc: () => void;
  onSend: () => void;
  onInvite: () => void;
  onRevokeInvite: (id: string) => void;
  onRemoveMember: (id: string) => void;
  onToggleBlockMember: (id: string, name?: string) => void;
  onReportMessage: (id: string) => void;
}

function initials(name = "User") {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "?";
}

function PersonAvatar({ name, url }: { name?: string; url?: string | null }) {
  return <Avatar className="ws-shared-room-avatar">
    {url && <AvatarImage src={url} alt="" />}
    <AvatarFallback>{initials(name)}</AvatarFallback>
  </Avatar>;
}

/** Presentation only: room data, mutations, realtime, and reply scope stay in the page. */
export function WorkspaceSharedRoomView({
  title, loading, error, members, pendingInvites, messages, userId, canReport,
  isOwner, blockedUserIds, lastAssistantId, sending, aiThinking, text, inviteEmail,
  settingsOpen, busyAction, scrollRef, textareaRef, onBack, onRetry,
  onSettingsOpenChange, onTextChange, onInviteEmailChange, onMentionArc, onSend,
  onInvite, onRevokeInvite, onRemoveMember, onToggleBlockMember, onReportMessage,
}: WorkspaceSharedRoomProps) {
  const id = useId();
  const composing = useRef(false);
  const peopleButtonRef = useRef<HTMLButtonElement>(null);
  const placesUsed = members.length + pendingInvites.length;
  const atMemberCap = placesUsed >= 6;
  const unavailable = loading || !!error || !title;
  const sendDisabled = unavailable || sending || aiThinking || !text.trim();
  const peopleBusy = unavailable || busyAction !== null;

  return <section className="ws-shared-room" aria-labelledby={`${id}-title`}>
    <header className="ws-shared-room-heading">
      <IconButton label="Back to all shared chats" onClick={onBack}><ArrowLeft /></IconButton>
      <div className="ws-shared-room-title">
        <span>Shared conversation</span>
        <h2 id={`${id}-title`}>{title || "Shared chat"}</h2>
      </div>
      <button ref={peopleButtonRef} type="button" className="ws-shared-room-people-button" onClick={() => onSettingsOpenChange(true)} disabled={!title} aria-haspopup="dialog" aria-expanded={settingsOpen} aria-label={title ? `Manage people, ${members.length} ${members.length === 1 ? "member" : "members"}` : "People in this chat"}>
        <Users aria-hidden="true" /><span>{title ? <>{members.length}<span className="ws-shared-room-people-label"> people</span></> : "People"}</span>
      </button>
    </header>

    <div ref={scrollRef} className="ws-shared-room-transcript" tabIndex={0} role="log" aria-label="Shared chat messages" aria-live="polite" aria-relevant="additions text" aria-busy={loading}>
      <div className="ws-shared-room-messages">
        {loading && <div className="ws-shared-room-status" role="status"><Loader2 className="ws-shared-room-spinner" aria-hidden="true" /><p>{title ? "Refreshing conversation…" : "Loading conversation…"}</p></div>}
        {!loading && error && <div className="ws-shared-room-status" role="alert"><Users aria-hidden="true" /><h3>Couldn't load this conversation</h3><p>{error}</p><button type="button" className="ws-secondary-button" onClick={onRetry}><RefreshCw aria-hidden="true" />Try again</button></div>}
        {!loading && !error && messages.length === 0 && <div className="ws-shared-room-empty">
          <ArcMark /><h3>A little space to think together.</h3><p>Send a message to everyone here. Mention <strong>@Arc</strong> for a reply or web search.</p><span>For other tools, open your main Arc chat.</span>
        </div>}
        {!error && !!title && messages.map((entry, index) => {
          const date = new Date(entry.createdAt);
          const previous = index > 0 ? new Date(messages[index - 1].createdAt) : null;
          const showDate = !previous || previous.toDateString() !== date.toDateString();
          return <Fragment key={entry.id}>
            {showDate && <div className="ws-shared-room-date"><time dateTime={entry.createdAt}>{date.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" })}</time></div>}
            <article className={`ws-shared-room-message${entry.isMine ? " is-mine" : ""}${entry.isArc ? " is-arc" : ""}`} aria-label={`Message from ${entry.name}`}>
              {entry.isArc ? <ArcMark className="ws-shared-room-arc-avatar" /> : <PersonAvatar name={entry.name} url={entry.avatarUrl} />}
              <div className="ws-shared-room-message-body">
                <div className="ws-shared-room-message-meta">
                  <strong>{entry.name}{entry.isMine ? " · You" : entry.isArc ? " · AI" : ""}</strong>
                  <time dateTime={entry.createdAt}>{date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                  {!entry.isMine && canReport && <button type="button" className="ws-shared-room-report" aria-label={`Report message from ${entry.name}`} title="Report this message" disabled={busyAction !== null} onClick={() => onReportMessage(entry.id)}>
                    {busyAction === `report:${entry.id}` ? <Loader2 className="ws-shared-room-spinner" aria-hidden="true" /> : <Flag aria-hidden="true" />}<span>Report</span>
                  </button>}
                </div>
                <MessageBubble message={entry.message} isLatestAssistant={entry.isArc && entry.id === lastAssistantId} shouldAnimateTypewriter={false} isThinking={false} />
              </div>
            </article>
          </Fragment>;
        })}
        {aiThinking && <div className="ws-shared-room-thinking" role="status"><ArcMark /><Loader2 className="ws-shared-room-spinner" aria-hidden="true" /><span>Arc is thinking…</span></div>}
      </div>
    </div>

    <div className="ws-shared-room-composer-shelf">
      <form className="ws-shared-room-composer" onSubmit={event => { event.preventDefault(); if (!sendDisabled && !composing.current) onSend(); }}>
        <div className="ws-shared-room-composer-top">
          <textarea ref={textareaRef} aria-label="Message everyone in this shared chat" aria-describedby={`${id}-composer-help`} value={text} onChange={event => onTextChange(event.target.value)} placeholder="Message everyone, or mention @Arc…" rows={1} disabled={unavailable}
            onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
            onKeyDown={event => {
              if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || composing.current || event.nativeEvent.keyCode === 229) return;
              event.preventDefault();
              if (!sendDisabled) onSend();
            }} />
          <button type="submit" className="ws-shared-room-send" aria-label={sending ? "Sending message" : "Send message"} disabled={sendDisabled}>
            {sending ? <Loader2 className="ws-shared-room-spinner" aria-hidden="true" /> : <ArrowUp aria-hidden="true" />}
          </button>
        </div>
        <div className="ws-shared-room-composer-bottom"><button type="button" className="ws-shared-room-mention" onClick={onMentionArc} disabled={unavailable}><ArcMark />Mention @Arc</button><span id={`${id}-composer-help`}>Visible to everyone in this chat</span></div>
      </form>
    </div>

    <WorkspaceOrganizerDialog title="People" description={title || "Shared conversation"} open={settingsOpen} onOpenChange={onSettingsOpenChange} returnFocusRef={peopleButtonRef}>
      <div className="ws-shared-room-people">
        {loading && <p className="ws-shared-room-safety-note" role="status">Refreshing people…</p>}
        {error && <p className="ws-shared-room-safety-note" role="alert">{error} Close this dialog to retry.</p>}
        <div className="ws-shared-room-people-summary"><h3>In this conversation</h3><span>{placesUsed} / 6 places</span></div>
        <ul className="ws-shared-room-member-list" aria-label="Members and pending invitations">
          {members.map(member => <li key={member.user_id} className="ws-shared-room-member">
            <PersonAvatar name={member.display_name} url={member.avatar_url} />
            <div className="ws-shared-room-member-info"><strong>{member.display_name || "User"}{member.user_id === userId && " (you)"}</strong><span>{member.role === "owner" ? "Owner" : "Member"}{blockedUserIds.has(member.user_id) && " · Blocked"}</span></div>
            <div className="ws-shared-room-member-actions">
              {member.user_id !== userId && <button type="button" className="ws-shared-room-block" onClick={() => onToggleBlockMember(member.user_id, member.display_name)} disabled={peopleBusy} aria-label={`${blockedUserIds.has(member.user_id) ? "Unblock" : "Block"} ${member.display_name || "member"}`}>
                {busyAction === `block:${member.user_id}` ? <Loader2 className="ws-shared-room-spinner" aria-hidden="true" /> : blockedUserIds.has(member.user_id) ? <ShieldOff aria-hidden="true" /> : <Ban aria-hidden="true" />}{blockedUserIds.has(member.user_id) ? "Unblock" : "Block"}
              </button>}
              {isOwner && member.role !== "owner" && <IconButton label={`Remove ${member.display_name || "member"} from this chat`} onClick={() => onRemoveMember(member.user_id)} disabled={peopleBusy}>{busyAction === `remove:${member.user_id}` ? <Loader2 className="ws-shared-room-spinner" /> : <Trash2 />}</IconButton>}
            </div>
          </li>)}
          {pendingInvites.map(invite => <li key={invite.id} className="ws-shared-room-member">
            <span className="ws-shared-room-invite-avatar" aria-hidden="true"><Mail /></span><div className="ws-shared-room-member-info"><strong>{invite.email}</strong><span>Invitation pending</span></div>
            {isOwner && <IconButton label={`Revoke invitation for ${invite.email}`} onClick={() => onRevokeInvite(invite.id)} disabled={peopleBusy}>{busyAction === `revoke:${invite.id}` ? <Loader2 className="ws-shared-room-spinner" /> : <Trash2 />}</IconButton>}
          </li>)}
        </ul>
        {isOwner && <form className="ws-shared-room-invite-form" onSubmit={event => { event.preventDefault(); if (!peopleBusy && !atMemberCap && inviteEmail.trim()) onInvite(); }}>
          <label htmlFor={`${id}-invite`}>Invite by email</label>
          <div><input id={`${id}-invite`} type="email" autoComplete="email" inputMode="email" required placeholder="name@example.com" value={inviteEmail} onChange={event => onInviteEmailChange(event.target.value)} disabled={atMemberCap || peopleBusy} aria-describedby={`${id}-invite-help`} onKeyDown={event => { if (event.key === "Enter" && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault(); }} />
            <button type="submit" className="ws-primary-button" disabled={atMemberCap || peopleBusy || !inviteEmail.trim()}>{busyAction === "invite" ? <Loader2 className="ws-shared-room-spinner" aria-hidden="true" /> : <UserPlus aria-hidden="true" />}Invite</button></div>
          <p id={`${id}-invite-help`}>{atMemberCap ? "This chat is full. Revoke an invitation or remove a member to make room." : "Up to 6 people, including you. Pending invitations reserve a place."}</p>
        </form>}
        <p className="ws-shared-room-safety-note">Blocking a member hides their messages from you in shared chats.</p>
      </div>
    </WorkspaceOrganizerDialog>
  </section>;
}
