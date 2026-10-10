import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Briefcase, Code2, Globe, ImagePlus, Lightbulb, Paperclip, PenLine, Search, Plus } from 'lucide-react';
import { WorkspaceComposerActions } from '@/components/chat-input/WorkspaceComposerActions';
import { AttachmentTray } from '@/components/chat-input/AttachmentTray';
import { WorkspaceCreateDock } from '@/components/chat-input/WorkspaceCreateDock';
import { GitHubMark, GitModeDock } from '@/components/GitModeDock';
import { ImageOptionsContent } from '@/components/ImageOptionsDock';
import { PromptEnhancer } from '@/components/PromptEnhancer';
import { PromptLibrary } from '@/components/PromptLibrary';
import { useWorkspaceTheme, type WorkspaceTheme } from '@/workspace/useWorkspaceTheme';
import { useQaState, useGitStore } from './mocks';
import '@/index.css';
import '@/workspace/workspace.css';
import './fixture.css';

const preview = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" fill="#888"/><circle cx="80" cy="50" r="29" fill="#ddd"/></svg>')}`;
function FixtureThemeOwner({ theme }: { theme: WorkspaceTheme }) {
  useWorkspaceTheme(theme);
  // Production's global theme owner also sets Noir and dark/light classes.
  // Mirror that only inside this fixture so the actual global CSS competes.
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches);
      document.documentElement.classList.toggle('dark', dark);
      document.documentElement.classList.toggle('light', !dark);
      document.documentElement.dataset.accent = 'noir';
    };
    apply(); media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  return null;
}

export function CreateModesFixture({ theme: controlledTheme, onThemeChange }: { theme?: WorkspaceTheme; onThemeChange?: (value: WorkspaceTheme) => void } = {}) {
  const [localTheme, setLocalTheme] = useState<WorkspaceTheme>('dark');
  const theme = controlledTheme ?? localTheme;
  const setTheme = onThemeChange ?? setLocalTheme;
  const [mode, setMode] = useState('image');
  const [menuOpen, setMenuOpen] = useState(false);
  const [promptsOpen, setPromptsOpen] = useState(false);
  const [draft, setDraft] = useState('Design a quiet workspace');
  const [documents, setDocuments] = useState(() => [new File(['Local fixture'], 'project-notes.txt')]);
  const [images, setImages] = useState(() => [new File(['local fixture'], 'composition.png')]);
  const [edit, setEdit] = useState(false);
  const [anchored, setAnchored] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const anchor = useRef<HTMLButtonElement>(null);
  const composer = useRef<HTMLDivElement>(null);
  const qa = useQaState();
  const choose = (next: string) => { setMenuOpen(false);setMode(next);input.current?.focus(); };
  const actions = [
    {id:'attach',label:'Attach File',icon:Paperclip,run:()=>choose('attachments')},
    {id:'generate',label:'Create Image',icon:ImagePlus,run:()=>choose('image')},
    {id:'write',label:'Writing Canvas',icon:PenLine,run:()=>{choose('write');setDraft('write/ A local draft');}},
    {id:'prompts',label:'Prompts & Ideas',icon:Lightbulb,run:()=>{setMenuOpen(false);setPromptsOpen(true);}},
    {id:'work',label:'Work Mode',icon:Briefcase,run:()=>choose('work')},
    {id:'code',label:'Code Canvas',icon:Code2,run:()=>{choose('code');setDraft('code/ A local draft');}},
    {id:'git',label:'Github Mode',icon:GitHubMark,run:()=>choose('git')},
    {id:'search',label:'Instant Web Search',icon:Globe,run:()=>{choose('search');setDraft('search/ A local question');}},
    {id:'deep-search',label:'Deep Search & Research',icon:Search,run:()=>{choose('deep-search');qa.record('Deep Search needs the separate panel checklist; no search is run.');}},
  ].map(action=>({...action,iconClass:''}));
  const controls = <>
    <div className="ws-create-enhancer-row"><PromptEnhancer workspaceUI text={draft} kind={mode==='git'?'git_plan':mode==='image'?'image':'chat'} onAccept={setDraft} /></div>
    {(mode==='image' || mode==='combined') && <div className="ws-create-mode ws-image-options-dock"><ImageOptionsContent workspaceUI /></div>}
    {(mode==='attachments' || mode==='combined') && <>
      {documents.length>0 && <AttachmentTray workspaceUI kind="documents" files={documents} onClear={()=>setDocuments([])} onRemove={index=>setDocuments(files=>files.filter((_,i)=>i!==index))} />}
      {images.length>0 && <AttachmentTray workspaceUI kind="images" files={images} previewUrls={images.map(()=>preview)} onClear={()=>setImages([])} onRemove={index=>setImages(files=>files.filter((_,i)=>i!==index))}>
        <button className="ws-attachment-edit-mode" aria-pressed={edit} onClick={()=>setEdit(!edit)}>Mode: {edit?'Edit':'Analyze'}</button>
        {edit && <ImageOptionsContent workspaceUI editMode />}
      </AttachmentTray>}
    </>}
    {(mode==='git' || mode==='combined') && <GitModeDock workspaceUI />}
  </>;
  return <main className="workspace-ui qa-create-page">
    {controlledTheme === undefined && <FixtureThemeOwner theme={theme} />}
    <header><h1>Creation controls: offline QA</h1><p>Actual production view components, local fixtures. No authentication, model calls, checkout, upload, or publishing.</p></header>
    <div className="qa-create-controls">
      {(['dark','light','system'] as const).map(value=><button key={value} aria-pressed={theme===value} onClick={()=>setTheme(value)}>{value}</button>)}
      <button onClick={()=>useQaState.setState({hasBoost:!qa.hasBoost})}>{qa.hasBoost?'Boost fixture':'Free fixture'}</button>
      <button aria-pressed={qa.failure} onClick={()=>useQaState.setState({failure:!qa.failure})}>Simulate error</button>
      <button aria-pressed={anchored} onClick={()=>setAnchored(!anchored)}>Composer-anchored</button>
      <button onClick={()=>useGitStore.setState({repositories:[],selectedRepo:null})}>Empty repositories</button>
    </div>
    <nav className="qa-create-controls" aria-label="Fixture surfaces">{['image','attachments','git','combined'].map(value=><button key={value} aria-pressed={mode===value} onClick={()=>setMode(value)}>{value}</button>)}<button onClick={()=>setPromptsOpen(true)}>Prompts</button><button onClick={()=>{setDocuments([new File(['Local fixture'],'project-notes.txt')]);setImages([new File(['Local fixture'],'composition.png')]);}}>Reset files</button></nav>
    {!anchored && <div className="qa-create-example">{controls}</div>}
    {anchored && <WorkspaceCreateDock portalRoot={document.body} anchor={composer.current?.getBoundingClientRect() || null}>{controls}</WorkspaceCreateDock>}
    <div ref={composer} className="qa-create-composer">
      <textarea ref={input} aria-label="Local composer draft" value={draft} onChange={e=>setDraft(e.target.value)} />
      <button ref={anchor} className="ci-menu-btn" aria-label="Add content" aria-haspopup="menu" aria-expanded={menuOpen} onClick={()=>setMenuOpen(!menuOpen)}><Plus /></button>
      <WorkspaceComposerActions showMenu={menuOpen} actions={actions} onClose={()=>setMenuOpen(false)} anchorRef={anchor} />
    </div>
    <aside className="qa-create-events" aria-live="polite">{qa.events.map((event,i)=><p key={i}>{event}</p>)}</aside>
    <PromptLibrary workspaceUI isOpen={promptsOpen} onClose={()=>setPromptsOpen(false)} prompts={[{label:'Exact supplied starter',prompt:'A supplied local draft'}]} onSelectPrompt={text=>{setDraft(text);input.current?.focus();}} />
  </main>;
}
createRoot(document.getElementById('root')!).render(<CreateModesFixture />);
