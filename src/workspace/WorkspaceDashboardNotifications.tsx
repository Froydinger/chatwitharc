import * as Popover from '@radix-ui/react-popover';
import { Bell } from 'lucide-react';
import { WorkspaceHeaderActions } from './WorkspaceHeaderActions';
import { DashboardNotificationTray, type DashboardNotification } from '@/components/dashboard/DashboardNotificationTray';

/** Presentation only. DashboardPreviewPage still owns notification history,
 * realtime updates, read/clear mutations and notification destinations. */
export function WorkspaceDashboardNotifications({ open, onOpenChange, notifications, onClear, onOpen }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notifications: DashboardNotification[];
  onClear: () => void | Promise<void>;
  onOpen: (notification: DashboardNotification) => void;
}) {
  const unreadCount = notifications.filter(notification => notification.unread).length;
  return <WorkspaceHeaderActions>
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        <button type="button" className="ws-icon-button ws-notification-trigger" aria-label="Recent push notifications" title="Recent push notifications">
          <Bell />
          {unreadCount > 0 && <span className="ws-notification-unread" aria-hidden="true" />}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="workspace-ui ws-dashboard-notification-popover" align="end" sideOffset={8} collisionPadding={12} aria-label="Recent notifications">
          <DashboardNotificationTray workspace notifications={notifications} onClear={onClear} onOpen={onOpen} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  </WorkspaceHeaderActions>;
}
