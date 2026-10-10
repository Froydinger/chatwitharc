import { Bell, Mail } from "lucide-react";
import { cn } from "@/lib/utils";

export type DashboardNotification = {
  id: string;
  title: string;
  detail: string;
  time: string;
  unread: boolean;
  channel: 'push' | 'email';
  chatId?: string;
  url?: string;
};

export function DashboardNotificationTray({ notifications, onClear, onOpen, workspace = false }: { notifications: DashboardNotification[]; onClear: () => void | Promise<void>; onOpen: (notification: DashboardNotification) => void; workspace?: boolean }) {
  const unreadCount = notifications.filter((notification) => notification.unread).length;

  return (
    <div
      id={workspace ? undefined : "dashboard-preview-notification-tray"}
      role={workspace ? undefined : "dialog"}
      aria-label={workspace ? undefined : "Recent notifications"}
      className={workspace ? "dashboard-preview-notification-tray ws-notification-tray p-3" : "dashboard-preview-notification-tray absolute right-0 top-[calc(100%+0.75rem)] z-[60] w-[min(88vw,360px)] overflow-hidden rounded-[24px] border p-3 shadow-[0_24px_70px_rgba(0,0,0,0.35)]"}
    >
      <div className="flex items-start justify-between gap-3 px-2 pb-2">
        <div>
          <p className="text-sm font-semibold">Recent notifications</p>

        </div>
        {unreadCount > 0 && <span className="dashboard-preview-notification-count rounded-full px-2 py-1 text-[10px] font-medium">{unreadCount} new</span>}
      </div>
      {notifications.length > 0 ? (
        <div className="space-y-1">
          {notifications.map((notification) => (
            <button key={notification.id} type="button" onClick={() => onOpen(notification)} className="dashboard-preview-notification-row flex w-full items-start gap-2.5 rounded-xl border px-2 py-2 text-left transition-colors hover:border-primary/30 hover:bg-primary/[0.06]">
              <span className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg", notification.unread ? "dashboard-preview-notification-unread-icon" : "bg-muted text-muted-foreground")}>
                {notification.channel === 'email' ? <Mail className="h-3 w-3" /> : <Bell className="h-3 w-3" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[10px] font-medium">{notification.title}</span>
                  <span className="shrink-0 text-[8px] text-muted-foreground/70">{notification.channel === 'email' ? 'Email' : 'Push'}</span>
                  {notification.unread && <span className="dashboard-preview-notification-unread-dot h-1.5 w-1.5 shrink-0 rounded-full" />}
                </span>
                <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{notification.detail}</span>
              </span>
              <span className="shrink-0 text-[9px] text-muted-foreground">{notification.time}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="dashboard-preview-notification-empty rounded-xl border px-3 py-4 text-center text-[11px] text-muted-foreground">You’re all caught up.</p>
      )}
      <button type="button" onClick={onClear} disabled={notifications.length === 0} className="mt-2 w-full rounded-xl border px-3 py-2 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-50">
        Clear notifications
      </button>
    </div>
  );
}

