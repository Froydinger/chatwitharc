import { lazy, Suspense } from 'react';
import './workspace-pages.css';

export type WorkspaceDashboardTab = 'overview' | 'chats' | 'apps' | 'images' | 'canvases' | 'memory';

type DashboardInnerTab = Exclude<WorkspaceDashboardTab, 'memory'> | 'memories';

const DashboardPageInner = lazy(() => import('@/pages/DashboardPage').then(module => ({ default: module.DashboardPageInner })));

const pageCopy: Record<WorkspaceDashboardTab, { title: string; description: string }> = {
  overview: { title: 'Your workspace', description: 'A current view of your conversations, saved work, and account usage.' },
  chats: { title: 'Chats', description: 'Find, organize, and return to your conversations.' },
  apps: { title: 'Apps', description: 'Open and manage projects you have built with Arc.' },
  images: { title: 'Images', description: 'Browse images saved from your conversations.' },
  canvases: { title: 'Canvases', description: 'Continue with code and writing saved from your chats.' },
  memory: { title: 'Memory', description: 'Review and update Arc’s living summary.' },
};

export function WorkspaceDashboardPage({
  tab,
}: {
  tab: WorkspaceDashboardTab;
}) {
  const title = pageCopy[tab].title;
  const activeTab = (tab === 'memory' ? 'memories' : tab) as DashboardInnerTab;

  return (
    <section className="workspace-dashboard-content-view" data-workspace-content-view={tab}>
      <div className="workspace-dashboard-content-wrap">
        <header className="workspace-dashboard-intro">
          <h2>{title}</h2>
          <p>{pageCopy[tab].description}</p>
        </header>
        <Suspense fallback={<div className="workspace-dashboard-loading" role="status">Loading {tab === 'memory' ? 'memory' : tab}…</div>}>
          <DashboardPageInner embedded workspacePresentation key={activeTab} activeTabOverride={activeTab} />
        </Suspense>
      </div>
    </section>
  );
}
