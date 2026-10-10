import { useRef, useState } from 'react';
import { Briefcase, Code2, Globe, ImagePlus, Lightbulb, Paperclip, PenLine, Search } from 'lucide-react';
import { WorkspaceComposerActions } from '@/components/chat-input/WorkspaceComposerActions';
import type { ComposerAction } from '@/components/chat-input/ComposerActions';
import { WorkspaceChatWelcome } from '@/components/WorkspaceChatWelcome';
import { useWorkspaceTheme, type WorkspaceTheme } from '@/workspace/useWorkspaceTheme';
import '../index.css';
import '../workspace/workspace.css';

const suggestions = [
  { label: 'Ask', prompt: 'Ask prompt' },
  { label: 'Reflect', prompt: 'Reflect prompt' },
  { label: 'Create', prompt: 'Create prompt' },
];

function WorkspaceChatWelcomeQa() {
  const [theme, setTheme] = useState<WorkspaceTheme>('system');
  const [menuOpen, setMenuOpen] = useState(false);
  const [ideasOpen, setIdeasOpen] = useState(false);
  const [selected, setSelected] = useState('');
  const anchorRef = useRef<HTMLButtonElement>(null);
  useWorkspaceTheme(theme);

  const choose = (label: string) => {
    setSelected(label);
    setMenuOpen(false);
  };
  const actions: ComposerAction[] = [
    { id: 'attach', section: 'Chat & Create', label: 'Attach File', icon: Paperclip, iconClass: '', run: () => choose('Attach File') },
    { id: 'generate', label: 'Create Image', icon: ImagePlus, iconClass: '', run: () => choose('Create Image') },
    { id: 'write', label: 'Writing Canvas', icon: PenLine, iconClass: '', run: () => choose('Writing Canvas') },
    { id: 'prompts', label: 'Prompts & Ideas', icon: Lightbulb, iconClass: '', run: () => { setMenuOpen(false); setIdeasOpen(true); } },
    { id: 'work', section: 'Work & Build', label: 'Work Mode', icon: Briefcase, iconClass: '', active: true, run: () => choose('Work Mode') },
    { id: 'code', label: 'Code Canvas', icon: Code2, iconClass: '', run: () => choose('Code Canvas') },
    { id: 'git', label: 'GitHub Mode', icon: Code2, iconClass: '', run: () => choose('GitHub Mode') },
    { id: 'search', label: 'Instant Web Search', icon: Globe, iconClass: '', run: () => choose('Instant Web Search') },
    { id: 'deep-search', label: 'Deep Search & Research', icon: Search, iconClass: '', run: () => choose('Deep Search & Research') },
  ];

  return <div className="workspace-ui ws-frame ws-live" data-section="chat">
    <aside className="ws-sidebar"><div className="ws-brand">Arc</div><button className="ws-new-chat">New chat</button></aside>
    <div className="ws-stage">
      <header className="ws-header"><div className="ws-title"><h1>Workspace welcome QA</h1></div></header>
      <main className="ws-main">
        <div className="ws-live-content">
          <WorkspaceChatWelcome
            suggestions={suggestions}
            onSelectPrompt={prompt => setSelected(`Prompt: ${prompt}`)}
            onShowMore={() => setIdeasOpen(true)}
          />
          <div className="qa-composer">
            <input aria-label="Composer draft" placeholder="Type a local draft" />
            <button
              ref={anchorRef}
              type="button"
              aria-label="Add content"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              onClick={() => setMenuOpen(open => !open)}
            >+</button>
            <WorkspaceComposerActions showMenu={menuOpen} actions={actions} anchorRef={anchorRef} onClose={() => setMenuOpen(false)} />
          </div>
          <div className="qa-controls">
            {(['system', 'light', 'dark'] as const).map(value => <button key={value} aria-pressed={theme === value} onClick={() => setTheme(value)}>{value}</button>)}
            <button onClick={() => { setMenuOpen(false); setIdeasOpen(false); setSelected(''); }}>Reset</button>
          </div>
          <output className="qa-status" aria-live="polite">{selected || (ideasOpen ? 'Prompt library open' : 'Ready')}</output>
        </div>
      </main>
    </div>
    {ideasOpen && <div className="qa-ideas-overlay" onClick={() => setIdeasOpen(false)}>
      <section role="dialog" aria-modal="true" aria-label="Prompts and ideas" onClick={event => event.stopPropagation()}>
        <h2>Prompts & Ideas</h2>
        <button onClick={() => setIdeasOpen(false)}>Close ideas</button>
      </section>
    </div>}
  </div>;
}

const style = document.createElement('style');
style.textContent = `
  .qa-composer { position:fixed; left:20px; right:20px; bottom:calc(18px + env(safe-area-inset-bottom, 0px)); z-index:30; display:flex; align-items:center; gap:10px; padding:12px; border:1px solid var(--ws-line); border-radius:16px; background:var(--ws-surface); }
  .qa-composer input { flex:1; min-width:0; min-height:44px; padding:10px; border:1px solid var(--ws-line); border-radius:10px; color:var(--ws-text); background:var(--ws-bg); font-size:16px; }
  .qa-composer button { min-width:44px; min-height:44px; border:1px solid var(--ws-line); border-radius:10px; color:var(--ws-text); background:var(--ws-bg); }
  .qa-controls { position:fixed; right:16px; top:calc(68px + env(safe-area-inset-top, 0px)); z-index:50; display:flex; gap:6px; }
  .qa-controls button { min-height:40px; padding:0 10px; border:1px solid var(--ws-line); border-radius:9px; color:var(--ws-text); background:var(--ws-canvas); }
  .qa-controls button[aria-pressed=true] { color:var(--ws-bg); background:var(--ws-text); }
  .qa-status { position:fixed; bottom:92px; left:16px; z-index:50; padding:5px 9px; border-radius:8px; color:var(--ws-muted); background:var(--ws-canvas); font-size:12px; }
  .qa-ideas-overlay { position:fixed; inset:0; z-index:12000; display:grid; place-items:center; background:#0009; }
  .qa-ideas-overlay section { width:min(420px,calc(100vw - 24px)); padding:24px; border:1px solid var(--ws-line); border-radius:18px; color:var(--ws-text); background:var(--ws-canvas); }
  .qa-ideas-overlay button { min-height:44px; padding:0 12px; border:1px solid var(--ws-line); border-radius:9px; color:var(--ws-text); background:var(--ws-bg); }
  @media(max-width:980px) { .qa-composer { left:12px; right:12px; } }
`;
document.head.append(style);
