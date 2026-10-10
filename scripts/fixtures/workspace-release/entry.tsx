import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Plus, ArrowUp, ImagePlus, Paperclip, Lightbulb, Code2, PenLine, Globe, Search, Briefcase } from 'lucide-react';
import { WorkspaceChrome, WorkspaceDialog, type WorkspaceSection } from '@/workspace/WorkspaceChrome';
import { WorkspaceDashboardPage, type WorkspaceDashboardModel } from '@/workspace/WorkspaceDashboardPages';
import { WorkspaceRemindersView, type WorkspaceReminder } from '@/workspace/WorkspaceRemindersView';
import { WorkspaceSharedChatsView } from '@/workspace/WorkspaceSharedChatsView';
import { GitHubMark } from '@/components/GitModeDock';
import { WorkspaceChatWelcome } from '@/components/WorkspaceChatWelcome';
import { pickWorkspacePrompts } from '@/workspace/workspacePrompts';
import { ComposerView } from '@/components/chat-input/ComposerView';
import { ComposerTextarea } from '@/components/chat-input/ComposerTextarea';
import { WorkspaceChatWorkToggle } from '@/components/chat-input/WorkspaceChatWorkToggle';
import { WorkspaceComposerActions } from '@/components/chat-input/WorkspaceComposerActions';
import { PromptLibrary } from '@/components/PromptLibrary';
import { useWorkspaceTheme, type WorkspaceTheme } from '@/workspace/useWorkspaceTheme';
import { useQaState } from '../workspace-create-modes/mocks';
import { useChatPins } from './mocks';
import { CreateModesFixture } from 'virtual:release-create-fixture';
import settings from 'virtual:release-settings';
import '@/index.css';
import '@/workspace/workspace.css';
import '@/workspace/workspace-settings.css';
import './fixture.css';

const date = new Date('2026-10-10T12:00:00Z');
const image = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="420"><rect width="600" height="420" fill="#292929"/><circle cx="300" cy="200" r="130" fill="#d0d0cc"/><text x="300" y="390" text-anchor="middle" fill="#fff" font-size="24">Local image fixture</text></svg>')}`;
const initialChats = [
  { id:'chat-one',title:'Plan a calm week',messages:[{id:'message-one',role:'user' as const,type:'text' as const,content:'A few priorities and room to think.',timestamp:date}],createdAt:date,lastMessageAt:date,persistenceOwnerId:'qa-release',messageCount:4 },
  { id:'chat-two',title:'A longer conversation title to check truncation and hover actions on small screens',messages:[],createdAt:date,lastMessageAt:date,persistenceOwnerId:'qa-release',messageCount:12,folderId:'folder-one',isWork:true },
];
const initialFolders = [{id:'folder-one',name:'Ongoing projects',userId:'qa-release',sortOrder:0,isPinned:true,createdAt:date}];
const canvases = [{id:'canvas-one',type:'writing' as const,content:'A simple plan\n\nKeep the next step small and useful.',sessionId:'chat-one',sessionTitle:'Plan a calm week',label:'Weekly plan',timestamp:date},{id:'canvas-two',type:'code' as const,content:'export const hello = () => "Hello, Arc";',language:'typescript',sessionId:'chat-two',sessionTitle:'Project notes',label:'A small tool',timestamp:date}];
const reminder: WorkspaceReminder = {id:'reminder-one',title:'Morning briefing',prompt:'Summarize three useful ideas for the day.',schedule_type:'cron',cron_expr:'0 8 * * *',run_at:null,next_run_at:'2026-10-11T08:00:00Z',last_run_at:'2026-10-10T08:00:00Z',status:'active',push_on_complete:true,notify_email:false,result_chat_id:'chat-one',timezone:'UTC'};
const pages = ['chat','overview','chats','apps','images','canvases','memory','reminders','shared','settings','modes'] as const;
type Page = typeof pages[number];
const log = (message: string) => { window.dispatchEvent(new CustomEvent('qa-release-event', {detail:message})); };

export function ChatFixture() {
  const [draft,setDraft] = useState('');
  const [mode,setMode] = useState<'ask'|'auto'>('ask');
  const [menu,setMenu] = useState(false);
  const [library,setLibrary] = useState(false);
  const input=useRef<HTMLTextAreaElement>(null),dock=useRef<HTMLDivElement>(null),anchor=useRef<HTMLButtonElement>(null);
  const boost=useQaState(state=>state.hasBoost);
  const icons=[Paperclip,ImagePlus,PenLine,Lightbulb,Briefcase,Code2,GitHubMark,Globe,Search];
  const labels=['Attach File','Create Image','Writing Canvas','Prompts & Ideas','Work Mode','Code Canvas','Github Mode','Instant Web Search','Deep Search & Research'];
  const ids=['attach','generate','write','prompts','work','code','git','search','deep-search'];
  const toggleMode=()=>{if(mode==='ask'&&!boost){log('Free fixture: existing Work upgrade action is blocked locally.');return;}setMode(value=>value==='ask'?'auto':'ask');};
  const actions=labels.map((label,index)=>({id:ids[index],label,icon:icons[index],iconClass:'',active:ids[index]==='work'&&mode==='auto',run:()=>{setMenu(false);if(ids[index]==='work')toggleMode();else if(ids[index]==='prompts')setLibrary(true);else{setDraft(label+' / local draft');log(label+' selected locally.')}}}));
  return <div className="ws-original-chat qa-release-chat">
    <div className="ws-original-message-scroll"><div className="ws-original-top-spacer" /><WorkspaceChatWelcome suggestions={pickWorkspacePrompts(()=>0)} onSelectPrompt={setDraft} onShowMore={()=>setLibrary(true)} /></div>
    <div className="ws-original-composer-dock"><div className="max-w-4xl mx-auto"><div className="arc-input-shell"><div className="glass-dock">
      <ComposerView inputBarRef={dock} active voiceActive={false} onFocusRequest={()=>input.current?.focus()}
        field={<ComposerTextarea ref={input} voiceActive={false} loading={false} workMode={mode==='auto'} value={draft} onChange={event=>setDraft(event.target.value)} />}
        actions={<button className="qa-send" aria-label="Offline send" onClick={()=>log('Sending is disabled; the draft remains local.')}><ArrowUp /></button>}
        menu={<><button ref={anchor} className="ci-menu-btn ws-icon-button" aria-label="Add content" aria-expanded={menu} onClick={()=>setMenu(!menu)}><Plus /></button><WorkspaceComposerActions showMenu={menu} actions={actions} onClose={()=>setMenu(false)} anchorRef={anchor} /></>}
        footer={<div className="ws-live-footer"><span>Auto</span><WorkspaceChatWorkToggle mode={mode} hasBoost={boost} onToggle={toggleMode} /></div>} />
    </div></div></div></div>
    <PromptLibrary workspaceUI isOpen={library} onClose={()=>setLibrary(false)} prompts={pickWorkspacePrompts(()=>0)} onSelectPrompt={setDraft} />
  </div>;
}

export function ReleaseFixture() {
  const params=new URLSearchParams(location.search);
  const [page,setPage]=useState<Page>(pages.includes(params.get('page') as Page)?params.get('page') as Page:'chat');
  const [theme,setTheme]=useState<WorkspaceTheme>((params.get('theme') as WorkspaceTheme)||'dark');
  const [state,setState]=useState('populated');
  const [settingsFile,setSettingsFile]=useState(settings[0]?.filename||'');
  const [search,setSearch]=useState(''),[chats,setChats]=useState(initialChats),[folders,setFolders]=useState(initialFolders);
  const [folderName,setFolderName]=useState(''),[creatingFolder,setCreatingFolder]=useState(false),[expanded,setExpanded]=useState<Record<string,boolean>>({'folder-one':true});
  const [viewImage,setViewImage]=useState<number|null>(null),[selectedCanvas,setSelectedCanvas]=useState<typeof canvases[number]|null>(null),[detailTab,setDetailTab]=useState<'canvas'|'deployed'>('canvas');
  const [memory,setMemory]=useState('I like concise plans, good questions, and a little room to reflect.'),[memoryDraft,setMemoryDraft]=useState(memory),[memoryEditing,setMemoryEditing]=useState(false),[memoryAdding,setMemoryAdding]=useState(false);
  const [showReminder,setShowReminder]=useState(false),[reminderTitle,setReminderTitle]=useState(''),[reminderPrompt,setReminderPrompt]=useState(''),[schedule,setSchedule]=useState('tomorrow at 8am'),[push,setPush]=useState(true);
  const [newShared,setNewShared]=useState(''),[dialog,setDialog]=useState(false),[event,setEvent]=useState('Offline fixture. All account/provider actions are blocked.');
  const dialogReturnFocusRef=useRef<HTMLElement|null>(null);
  const openDialog=(trigger?:HTMLElement)=>{if(dialog)return;const active=document.activeElement;dialogReturnFocusRef.current=trigger??(active instanceof HTMLElement?active:null);setDialog(true);};
  const pins=useChatPins();
  const qa=useQaState();
  useWorkspaceTheme(theme);
  useEffect(()=>{const media=window.matchMedia('(prefers-color-scheme: dark)');const apply=()=>{const dark=theme==='dark'||(theme==='system'&&media.matches);document.documentElement.classList.toggle('dark',dark);document.documentElement.classList.toggle('light',!dark);document.documentElement.dataset.accent='noir';};apply();media.addEventListener('change',apply);return()=>media.removeEventListener('change',apply);},[theme]);
  useEffect(()=>{const handler=(value:Event)=>setEvent((value as CustomEvent<string>).detail);window.addEventListener('qa-release-event',handler);return()=>window.removeEventListener('qa-release-event',handler);},[]);
  const empty=state==='empty',loading=state==='loading',error=state==='error'?'Simulated offline error. Your saved work is retained.':null;
  const shown=empty?[]:chats.filter(chat=>chat.title.toLowerCase().includes(search.toLowerCase()));
  const go=(next:string)=>{setSearch('');setPage(next==='build'?'apps':next as Page);};
  const rename=async(id:string,title:string)=>setChats(rows=>rows.map(row=>row.id===id?{...row,title}:row));
  const remove=async(id:string)=>setChats(rows=>rows.filter(row=>row.id!==id));
  const open=()=>{setPage('chat');log('Opened a local chat fixture; no history was fetched.');};
  const noop=()=>log('Local fixture action recorded; no request was sent.');
  const common={loading,error,search,onSearchChange:setSearch,page:1,totalPages:1,onPageChange:noop,onRetry:noop,timeAgo:()=> 'Today'};
  let model:WorkspaceDashboardModel|undefined;
  if(page==='overview')model={tab:'overview',greeting:'Good afternoon',displayName:'Offline QA',chatsLoading:loading,recentChats:shown,stats:[{label:'Chats',value:2,tab:'chats'},{label:'Apps',value:1,tab:'apps'},{label:'Images',value:2,tab:'images'},{label:'Canvases',value:2,tab:'canvases'}],timeAgo:common.timeAgo,onNewChat:open,onOpenChat:open,onDeleteChat:remove,onRenameChat:rename,onOpenLibrary:go,usageSnapshot:<p>Local allowance snapshot. No account was queried.</p>,onOpenPlan:()=>go('settings'),onOpenReminders:()=>go('reminders'),onOpenShared:()=>go('shared'),onOpenStatus:noop};
  if(page==='chats')model={tab:'chats',isLoaded:!loading,sessions:shown,currentSessionId:'chat-one',folders:empty?[]:folders,search,onSearchChange:setSearch,page:1,totalPages:1,onPageChange:noop,expandedFolders:expanded,onToggleFolder:id=>setExpanded(value=>({...value,[id]:!value[id]})),isCreatingFolder:creatingFolder,isSavingFolder:false,newFolderName:folderName,onFolderNameChange:setFolderName,onCreateFolder:()=>{setFolders(rows=>[...rows,{...initialFolders[0],id:'folder-'+Date.now(),name:folderName}]);setCreatingFolder(false);setFolderName('');},onCancelCreateFolder:()=>setCreatingFolder(false),onStartCreateFolder:()=>setCreatingFolder(true),onDeleteFolder:id=>setFolders(rows=>rows.filter(row=>row.id!==id)),onPinFolder:(id,value)=>setFolders(rows=>rows.map(row=>row.id===id?{...row,isPinned:value}:row)),onMoveChat:(id,folderId)=>setChats(rows=>rows.map(row=>row.id===id?{...row,folderId:folderId||undefined}:row)),onOpenChat:open,onNewChat:open,onDeleteChat:remove,onRenameChat:rename};
  if(page==='apps')model={...common,tab:'apps',apps:empty?[]:[{id:'app-one',title:'A quiet planner',prompt:'A simple local project card with no published iframe.',favicon_label:null,netlify_url:null,netlify_subdomain:null,updated_at:date.toISOString(),created_at:date.toISOString(),version:3}],openingAppId:null,deletingAppId:null,onCreate:noop,onOpen:noop,onDelete:noop,onEditSettings:noop,settings:{app:null,title:'',description:'',hideBadge:false,saving:false,onOpenChange:noop,onTitleChange:noop,onDescriptionChange:noop,onBadgeChange:noop,onSave:noop}};
  if(page==='images')model={...common,tab:'images',images:empty?[]:[{url:image,prompt:'A monochrome local illustration',sessionId:'chat-one',messageId:'image-one',timestamp:date},{url:image,prompt:'Another locally drawn image for grid sizing',sessionId:'chat-two',messageId:'image-two',timestamp:date}],totalCount:empty?0:2,hasMore:false,onLoadMore:noop,viewerIndex:viewImage,onSetViewerIndex:setViewImage,onDownload:noop,onOpenChat:open};
  if(page==='canvases')model={...common,tab:'canvases',canvases:empty?[]:canvases,selected:selectedCanvas,onSelect:setSelectedCanvas,page:1,totalPages:1,hasMore:false,onLoadMore:noop,onOpenCanvas:noop,onOpenChat:open,onCreateCanvas:noop,creatingCanvas:false,deployedView:<p>No sites exist in this offline fixture.</p>,detailTab,onDetailTab:setDetailTab};
  if(page==='memory')model={tab:'memory',loading,error,summary:empty?null:{id:'memory-one',content:memory,source:'memory',created_at:date.toISOString(),updated_at:date.toISOString()},isAdding:memoryAdding,newContent:memoryDraft,onNewContent:setMemoryDraft,onStartAdd:()=>{setMemoryDraft('');setMemoryAdding(true);},onAdd:()=>{setMemory(value=>value+'\n'+memoryDraft);setMemoryAdding(false);},onCancelAdd:()=>setMemoryAdding(false),editing:memoryEditing,editContent:memoryDraft,onEditContent:setMemoryDraft,onStartEdit:()=>{setMemoryDraft(memory);setMemoryEditing(true);},onCancelEdit:()=>setMemoryEditing(false),onSave:()=>{setMemory(memoryDraft);setMemoryEditing(false);},saving:false,onImport:noop,onExport:noop,onRetry:noop};
  const section:WorkspaceSection=['overview','chats','modes'].includes(page)?'chat':page as WorkspaceSection;
  return <><div className="qa-release-tools"><strong>Arc offline QA</strong>
    <label>Page<select aria-label="Fixture page" value={page} onChange={value=>go(value.target.value)}>{pages.map(value=><option key={value}>{value}</option>)}</select></label>
    <label>Theme<select aria-label="Fixture theme" value={theme} onChange={value=>setTheme(value.target.value as WorkspaceTheme)}>{['dark','light','system'].map(value=><option key={value}>{value}</option>)}</select></label>
    <label>State<select aria-label="Fixture state" value={state} onChange={value=>setState(value.target.value)}>{['populated','empty','loading','error'].map(value=><option key={value}>{value}</option>)}</select></label>
    <button onClick={()=>useQaState.setState({hasBoost:!qa.hasBoost})}>{qa.hasBoost?'Boost fixture':'Free fixture'}</button>
    <button onClick={()=>{const hide=document.querySelector<HTMLButtonElement>('.ws-sidebar [aria-label="Hide sidebar"]');if(hide)hide.click();else document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));}}>Hide sidebar</button>
    <button onClick={()=>document.querySelector<HTMLButtonElement>('.ws-desktop-sidebar-trigger[aria-label="Show sidebar"]')?.click()}>Peek sidebar</button>
    <button onClick={()=>{document.querySelector<HTMLButtonElement>('.ws-desktop-sidebar-trigger[aria-label="Show sidebar"]')?.click();requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('.ws-sidebar [aria-label="Dock sidebar"]')?.click());}}>Dock sidebar</button>
    {page==='settings'&&<label>Settings<select aria-label="Settings fixture" value={settingsFile} onChange={value=>setSettingsFile(value.target.value)}>{settings.map(item=><option key={item.filename} value={item.filename}>{item.section}: {item.scenario}</option>)}</select></label>}
  </div><div className="qa-release-viewport"><WorkspaceChrome section={section} title={page} accountId="qa-release" accountName="Offline QA" recent={chats.map(chat=>({...chat,pinned:pins.pinnedIds.includes(chat.id)}))} currentId="chat-one" allChatsActive={page==='chats'} folders={folders} onNavigate={go} onNewChat={open} onOpenChat={open} onAllChats={()=>go('chats')} onSearch={openDialog} onUsage={()=>openDialog()} onInfo={()=>openDialog()} onAccount={()=>go('settings')} onPinChat={pins.setPinned} onRenameChat={rename} onMoveChat={async(id,folderId)=>setChats(rows=>rows.map(row=>row.id===id?{...row,folderId:folderId||undefined}:row))} onDeleteChat={remove}>
    <div className="ws-live-content">{page==='chat'?<ChatFixture/>:model?<div style={{height:'100%',overflow:'auto'}}><WorkspaceDashboardPage model={model}/></div>:page==='modes'?<div style={{height:'100%',overflow:'auto'}}><CreateModesFixture theme={theme} onThemeChange={setTheme}/></div>:page==='settings'?<div className="qa-release-settings"><p className="qa-release-settings-note">Actual SettingsPanel and descendants rendered to inert HTML. Use the fixture selector; settings mutations are disabled.</p><div onClickCapture={event=>{event.preventDefault();event.stopPropagation();log('Settings controls are inert in this visual fixture.')}} onSubmitCapture={event=>event.preventDefault()} dangerouslySetInnerHTML={{__html:settings.find(item=>item.filename===settingsFile)?.html||''}} /></div>:page==='shared'?<WorkspaceSharedChatsView chats={empty?[]:[{id:'shared-one',title:'Launch planning',owner_id:'qa-release',updated_at:date.toISOString()},{id:'shared-two',title:'A shared conversation with a long title that wraps on a phone',owner_id:'another-fixture',updated_at:date.toISOString()}]} userId="qa-release" loading={loading} error={error} onRetry={noop} creating={false} newTitle={newShared} onTitleChange={setNewShared} onCreate={async()=>{setNewShared('');noop();}} deletingId={null} onDelete={async()=>noop()} onOpen={noop}/>:<WorkspaceRemindersView tasks={empty?[]:[reminder,{...reminder,id:'reminder-two',title:'Review the week',status:'paused'}]} loading={loading} error={error} onRetry={noop} showNew={showReminder} onShowNewChange={setShowReminder} title={reminderTitle} onTitleChange={setReminderTitle} prompt={reminderPrompt} onPromptChange={setReminderPrompt} scheduleText={schedule} onScheduleChange={setSchedule} pushOn={push} onPushChange={setPush} creating={false} onCreate={async()=>{setShowReminder(false);noop();}} onToggleStatus={async()=>noop()} onRunNow={async()=>noop()} onRemove={async()=>noop()} onOpenResults={open} expiredTask={null} onCloseReschedule={noop} resumeSchedule="tomorrow" onResumeScheduleChange={noop} resuming={false} onReschedule={async()=>noop()}/>}</div>
    <WorkspaceDialog title="Offline workspace dialog" returnFocusRef={dialogReturnFocusRef} open={dialog} onOpenChange={setDialog}><div className="ws-dialog-body"><input autoFocus aria-label="Fixture search" placeholder="Try keyboard focus and close"/><p>This dialog uses the real Workspace focus lifecycle. No search is sent.</p></div></WorkspaceDialog>
  </WorkspaceChrome></div><div className="qa-release-note" role="status">{event}</div></>;
}

window.fetch=async()=>{throw new Error('External requests are disabled in this offline fixture.');};
window.WebSocket=class { constructor(){throw new Error('Sockets are disabled in this offline fixture.');} } as unknown as typeof WebSocket;
document.addEventListener('click',event=>{const anchor=(event.target as Element)?.closest('a[href]');if(anchor){event.preventDefault();log('Links are disabled in this offline fixture.');}},true);
const root=createRoot(document.getElementById('root')!);
root.render(<ReleaseFixture/>);
window.addEventListener('pagehide',()=>root.unmount(),{once:true});
