import { DashboardPreviewPage } from '@/pages/DashboardPreviewPage';

/** Preserve the live dashboard's notification tray, account actions, history,
 * subscriptions and tab handlers. Only duplicate navigation is hidden by scoped CSS. */
export function WorkspaceDashboard() {
  return <div className="ws-live-dashboard"><DashboardPreviewPage live /></div>;
}
