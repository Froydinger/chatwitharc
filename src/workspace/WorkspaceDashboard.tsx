import { DashboardPreviewPage } from '@/pages/DashboardPreviewPage';

/** Keep the live dashboard controller and its subscriptions/handlers mounted.
 * Workspace places its notification tray in the toolbar and uses sidebar account access. */
export function WorkspaceDashboard() {
  return <div className="ws-live-dashboard"><DashboardPreviewPage live /></div>;
}
