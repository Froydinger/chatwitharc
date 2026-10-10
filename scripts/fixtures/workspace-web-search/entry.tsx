import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SearchResultsCard } from '@/components/SearchResultsCard';
import { SourcesAccordion } from '@/components/SourcesAccordion';
import { WorkspaceWebSearchDialog } from '@/workspace/WorkspaceWebSearchDialog';
import { WorkspaceUIContext } from '@/workspace/WorkspaceContext';
import { useWorkspaceTheme, type WorkspaceTheme } from '@/workspace/useWorkspaceTheme';
import '@/index.css';
import '@/workspace/workspace.css';
import './fixture.css';

const sources = Array.from({ length: 9 }, (_, index) => ({ title: index === 0 ? 'A practical field guide to quiet workspaces' : `Workspace research source ${index + 1}`, url: `https://example.com/research/${index + 1}`, ...(index % 2 ? { snippet: 'A source excerpt in the Work response shape.' } : { content: 'A source excerpt in the ordinary Tavily response shape. These inert examples exist only in this offline QA fixture.' }) }));
const answer = '## A quieter place to work\n\nChoose a spot with **natural light**, a clear desk, and a comfortable chair. [Read the original guide](https://example.com/research/1).\n\n| Choice | What to look for |\n| --- | --- |\n| Light | Soft, indirect daylight |\n| Sound | A quiet room or steady background noise |\n| Desk | Enough room to work comfortably |\n\n### The next step\n\n- Clear one small area.\n- Keep the things you use close by.\n- Adjust as you learn what works.';
function Fixture() {
  const [theme, setTheme] = useState<WorkspaceTheme>('dark');
  const [workspace, setWorkspace] = useState(true);
  const [longTitle, setLongTitle] = useState(false);
  useWorkspaceTheme(theme);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => { const dark = theme === 'dark' || theme === 'system' && media.matches; document.documentElement.classList.toggle('dark', dark); document.documentElement.classList.toggle('light', !dark); document.documentElement.dataset.accent = 'noir'; };
    apply(); media.addEventListener('change', apply); return () => media.removeEventListener('change', apply);
  }, [theme]);
  // Same visual viewport tokens as the authenticated shell, for keyboard QA.
  useEffect(() => {
    const apply = () => { document.documentElement.style.setProperty('--ws-viewport-height', `${window.visualViewport?.height || window.innerHeight}px`); document.documentElement.style.setProperty('--ws-viewport-top', `${window.visualViewport?.offsetTop || 0}px`); };
    apply(); window.visualViewport?.addEventListener('resize', apply); window.visualViewport?.addEventListener('scroll', apply); window.addEventListener('resize', apply);
    return () => { window.visualViewport?.removeEventListener('resize', apply); window.visualViewport?.removeEventListener('scroll', apply); window.removeEventListener('resize', apply); };
  }, []);
  return <WorkspaceUIContext.Provider value={workspace}><main className={`qa-web-search ${workspace ? 'workspace-ui' : ''}`}>
    <h1>Web search · offline Safari QA</h1><p>Actual result card, source badge, dialog and shared Markdown renderer. Inert fixture data only. No search or account calls.</p>
    <nav aria-label="Fixture controls">{(['dark', 'light', 'system'] as const).map(mode => <button key={mode} aria-pressed={theme === mode} onClick={() => setTheme(mode)}>{mode}</button>)}<button aria-pressed={!workspace} onClick={() => setWorkspace(!workspace)}>Legacy presentation</button><button aria-pressed={longTitle} onClick={() => setLongTitle(!longTitle)}>Long query</button></nav>
    <SearchResultsCard content={answer} sources={sources} query={longTitle ? 'How can I make a small shared workspace calmer, more comfortable, and easier to use throughout a long working day? '.repeat(3) : 'How can I make my workspace feel calmer?'} />
    <section><h2>Automatic search / reply metadata source entry</h2><SourcesAccordion sources={sources} messageContent={answer} showMediaEmbeds={false} /></section>
    {workspace && <section><h2>Recorded reply with no attached source links</h2><WorkspaceWebSearchDialog content="" sources={[]} /></section>}
  </main></WorkspaceUIContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
