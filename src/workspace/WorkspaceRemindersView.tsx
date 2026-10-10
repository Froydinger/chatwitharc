import { useRef } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { AlertCircle, Bell, BellOff, CheckCircle2, Clock, Loader2, MoreHorizontal, Pause, Play, Plus, Repeat, Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { describeCronSchedule } from '@/lib/scheduleLabels';
import { WorkspaceOrganizerDialog } from './WorkspaceOrganizerDialog';
import './workspace-reminders-shared.css';

export interface WorkspaceReminder {
  id: string;
  title: string;
  prompt: string;
  schedule_type: 'once' | 'cron';
  cron_expr: string | null;
  run_at: string | null;
  next_run_at: string | null;
  last_run_at: string | null;
  status: 'active' | 'paused' | 'completed' | 'failed';
  push_on_complete: boolean;
  notify_email: boolean;
  result_chat_id: string | null;
  timezone: string;
}

interface WorkspaceRemindersViewProps {
  tasks: WorkspaceReminder[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  showNew: boolean;
  onShowNewChange: (open: boolean) => void;
  title: string;
  onTitleChange: (value: string) => void;
  prompt: string;
  onPromptChange: (value: string) => void;
  scheduleText: string;
  onScheduleChange: (value: string) => void;
  pushOn: boolean;
  onPushChange: (value: boolean) => void;
  creating: boolean;
  onCreate: () => Promise<void>;
  onToggleStatus: (task: WorkspaceReminder) => Promise<void>;
  onRunNow: (task: WorkspaceReminder) => Promise<void>;
  onRemove: (task: WorkspaceReminder) => Promise<void>;
  onOpenResults: (chatId: string) => void;
  expiredTask: WorkspaceReminder | null;
  onCloseReschedule: () => void;
  resumeSchedule: string;
  onResumeScheduleChange: (value: string) => void;
  resuming: boolean;
  onReschedule: () => Promise<void>;
}

const statuses = {
  active: { label: 'Active', Icon: Clock },
  paused: { label: 'Paused', Icon: Pause },
  completed: { label: 'Completed', Icon: CheckCircle2 },
  failed: { label: 'Failed', Icon: AlertCircle },
} as const;

function dateLabel(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

/** Presentation only: scheduling, notifications and realtime stay in TasksPage. */
export function WorkspaceRemindersView(props: WorkspaceRemindersViewProps) {
  const addTriggerRef = useRef<HTMLButtonElement>(null);
  const headerAddRef = useRef<HTMLButtonElement>(null);
  const resumeTriggerRef = useRef<HTMLButtonElement>(null);
  const actionTriggers = useRef(new Map<string, HTMLButtonElement>());
  const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  return <>
    <section className="workspace-organizer-page" aria-labelledby="workspace-reminders-heading">
      <div className="workspace-organizer-intro">
        <div>
          <span className="workspace-organizer-eyebrow">FOR WHEN IT MATTERS</span>
          <h2 id="workspace-reminders-heading">Reminders</h2>
          <p>Arc runs prompts on a schedule and pings you when they're done.</p>
        </div>
        <button ref={headerAddRef} className="ws-primary-button" onClick={event => { addTriggerRef.current = event.currentTarget; props.onShowNewChange(true); }}><Plus />Add reminder</button>
      </div>

      {props.error && <div className="workspace-organizer-error" role="alert">
        <AlertCircle /><div><strong>Couldn't load reminders</strong><p>{props.error}</p></div>
        <button className="ws-secondary-button" onClick={props.onRetry} disabled={props.loading}>Try again</button>
      </div>}
      {props.loading && !props.tasks.length ? <div className="workspace-organizer-loading" role="status"><Loader2 />Loading reminders…</div>
        : !props.error && !props.tasks.length ? <div className="workspace-organizer-empty">
          <Bell /><h3>Make room for what matters.</h3>
          <p>Schedule a prompt for later. Arc will run it and keep the results in a chat you can return to.</p>
          <button className="ws-primary-button" onClick={event => { addTriggerRef.current = event.currentTarget; props.onShowNewChange(true); }}><Plus />Add your first reminder</button>
        </div> : null}

      {!!props.tasks.length && <>
        <div className="workspace-organizer-records" aria-label="Scheduled reminders" aria-busy={props.loading}>
          {props.tasks.map(task => {
            const status = statuses[task.status];
            const next = dateLabel(task.next_run_at);
            const last = dateLabel(task.last_run_at);
            const resumeLabel = task.status === 'completed' ? 'Schedule again' : task.status === 'failed' ? 'Retry reminder' : 'Resume reminder';
            return <article className="workspace-organizer-record workspace-reminder-record" key={task.id}>
              <Bell className="workspace-organizer-record-icon" aria-hidden="true" />
              <div className="workspace-organizer-record-copy">
                <div className="workspace-organizer-record-title"><h3>{task.title}</h3><span className="workspace-reminder-status" data-status={task.status}><status.Icon />{status.label}</span></div>
                <p className="workspace-reminder-prompt">{task.prompt}</p>
                <div className="workspace-organizer-record-meta">
                  <span>{task.schedule_type === 'cron' ? <Repeat /> : <Clock />}{task.schedule_type === 'cron' ? describeCronSchedule(task.cron_expr, task.next_run_at) : 'One time'}</span>
                  <span>{task.push_on_complete ? <Bell /> : <BellOff />}{task.push_on_complete ? 'Push on completion' : 'Push off'}</span>
                </div>
                <div className="workspace-reminder-times">
                  {task.status === 'active' && <span>Next: {next || 'Awaiting schedule'}</span>}
                  {task.status === 'paused' && next && <span>Scheduled for: {next}</span>}
                  {last && <span>Last run: {last}</span>}
                  {task.timezone && <span>Saved time zone: {task.timezone}</span>}
                </div>
                {task.result_chat_id && <button className="workspace-organizer-text-action" onClick={() => props.onOpenResults(task.result_chat_id!)}>View results</button>}
              </div>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild><button ref={element => { if (element) actionTriggers.current.set(task.id, element); else actionTriggers.current.delete(task.id); }} className="ws-icon-button" aria-label={`Actions for ${task.title}`} title={`Actions for ${task.title}`}><MoreHorizontal /></button></DropdownMenu.Trigger>
                <DropdownMenu.Portal><DropdownMenu.Content className="workspace-ui ws-menu workspace-organizer-menu" align="end" sideOffset={6}>
                  {task.status === 'active' && <DropdownMenu.Item onSelect={() => void props.onRunNow(task)}><Play />Run now</DropdownMenu.Item>}
                  <DropdownMenu.Item onSelect={() => { resumeTriggerRef.current = actionTriggers.current.get(task.id) ?? null; void props.onToggleStatus(task); }}>{task.status === 'active' ? <Pause /> : <Play />}{task.status === 'active' ? 'Pause reminder' : resumeLabel}</DropdownMenu.Item>
                  <DropdownMenu.Separator />
                  <DropdownMenu.Item onSelect={() => void props.onRemove(task)}><Trash2 />Delete reminder</DropdownMenu.Item>
                </DropdownMenu.Content></DropdownMenu.Portal>
              </DropdownMenu.Root>
            </article>;
          })}
        </div>
        <p className="workspace-organizer-footnote">Times are shown in {localTimezone}.</p>
      </>}
    </section>

    <WorkspaceOrganizerDialog title="Add reminder" description="Choose what Arc should do and when it should run." open={props.showNew} onOpenChange={open => { if (!props.creating) props.onShowNewChange(open); }} returnFocusRef={addTriggerRef} fallbackFocusRef={headerAddRef} busy={props.creating}>
      <form className="ws-dialog-body workspace-organizer-form" onSubmit={event => { event.preventDefault(); if (!props.creating) void props.onCreate(); }}>
        <label htmlFor="workspace-reminder-title">Title<input id="workspace-reminder-title" required autoFocus value={props.title} onChange={event => props.onTitleChange(event.target.value)} placeholder="Morning briefing" disabled={props.creating} /></label>
        <label htmlFor="workspace-reminder-prompt">Prompt<textarea id="workspace-reminder-prompt" required value={props.prompt} onChange={event => props.onPromptChange(event.target.value)} placeholder="Give me a 3-bullet briefing on AI news from the last 24 hours." rows={4} disabled={props.creating} /></label>
        <label htmlFor="workspace-reminder-schedule">Schedule<input id="workspace-reminder-schedule" required value={props.scheduleText} onChange={event => props.onScheduleChange(event.target.value)} placeholder="every day at 8am" aria-describedby="workspace-reminder-schedule-help" disabled={props.creating} /></label>
        <p id="workspace-reminder-schedule-help">Try “every day at 8am”, “every hour”, “every Monday”, or “in 30 minutes”. Times use {localTimezone}.</p>
        <div className="workspace-organizer-switch-row"><label htmlFor="workspace-reminder-push">Push notification when done</label><Switch id="workspace-reminder-push" checked={props.pushOn} onCheckedChange={props.onPushChange} disabled={props.creating} /></div>
        <div className="workspace-organizer-switch-row"><label htmlFor="workspace-reminder-email">Email me the results<small>Coming soon</small></label><Switch id="workspace-reminder-email" checked={false} disabled /></div>
        <div className="ws-dialog-actions"><button type="button" className="ws-secondary-button" onClick={() => props.onShowNewChange(false)} disabled={props.creating}>Cancel</button><button className="ws-primary-button" type="submit" disabled={props.creating || !props.title.trim() || !props.prompt.trim() || !props.scheduleText.trim()}>{props.creating ? 'Scheduling…' : 'Schedule reminder'}</button></div>
      </form>
    </WorkspaceOrganizerDialog>

    <WorkspaceOrganizerDialog title="When would you like me to remind you?" description={`The original time for “${props.expiredTask?.title ?? ''}” has already passed. Choose a new time to resume it.`} open={!!props.expiredTask} onOpenChange={open => { if (!open && !props.resuming) props.onCloseReschedule(); }} returnFocusRef={resumeTriggerRef} fallbackFocusRef={headerAddRef} busy={props.resuming}>
      <form className="ws-dialog-body workspace-organizer-form" onSubmit={event => { event.preventDefault(); if (!props.resuming) void props.onReschedule(); }}>
        <label htmlFor="workspace-reminder-resume">New reminder time<input id="workspace-reminder-resume" required autoFocus value={props.resumeSchedule} onChange={event => props.onResumeScheduleChange(event.target.value)} placeholder="in 5 minutes" disabled={props.resuming} /></label>
        <p>Try “in 5 minutes”, “every day at 8am”, or “every Monday”. Times use {localTimezone}.</p>
        <div className="ws-dialog-actions"><button className="ws-secondary-button" type="button" onClick={props.onCloseReschedule} disabled={props.resuming}>Cancel</button><button className="ws-primary-button" type="submit" disabled={props.resuming || !props.resumeSchedule.trim()}>{props.resuming ? 'Rescheduling…' : 'Resume reminder'}</button></div>
      </form>
    </WorkspaceOrganizerDialog>
  </>;
}
