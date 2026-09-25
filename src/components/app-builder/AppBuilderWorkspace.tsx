import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  ArrowDown, ArrowLeft, ArrowUp, Check, ChevronDown, CircleHelp, Code2,
  Copy, ExternalLink, FileCode2, GitBranch, Globe, LoaderCircle, LockKeyhole,
  Monitor, PanelRightClose, Rocket, Smartphone, Tablet,
  Upload, X,
} from 'lucide-react';
import { AppBuilderPreview, type PreviewSize } from './AppBuilderPreview';
import { AppBuilderPublishDialog } from './AppBuilderPublishDialog';
import { AppBuilderGitHandoff } from './AppBuilderGitHandoff';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useIsMobile } from '@/hooks/use-mobile';
import { useIDEStore } from '@/store/useIDEStore';
import { useSubscription } from '@/hooks/useSubscription';
import { supabase } from '@/integrations/supabase/client';
import { exportProjectAsZip } from '@/lib/exportZip';
import { deployToNetlify, unpublishFromNetlify } from '@/lib/deploy';
import { createCloudAppRuns } from '@/services/cloudAppRunClient';
import type { CloudAppRuns, CloudAppRunView } from '@/services/cloudAppRuns';
import { cloudAppTranscript, cloudAuditActions } from '@/services/cloudAppTranscript';
import { loadAppBuilderProject, saveAppBuilderProject, ensureAppBuilderSystemFiles, type AppBuilderMessage, type AppBuilderProjectMetadata, type LoadedAppBuilderProject } from '@/services/appBuilderProject';
import { DEFAULT_FILES, type AgentAction, type VirtualFileSystem } from '@/types/ide';

const durableAppsEnabled = import.meta.env.VITE_CLOUD_APP_RUNS_ENABLED === 'true';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEMO_MESSAGES: AppBuilderMessage[] = [
  { id: 'demo-user-1', role: 'user', content: 'Build me a calm habit tracker with a weekly streak, a few daily habits, and a warm minimal style.', timestamp: Date.now() - 120000 },
  { id: 'demo-assistant-1', role: 'assistant', content: 'I made the first screen and added a weekly streak, daily habit cards, and a simple progress view. Want to change anything?', timestamp: Date.now() - 90000 },
];

type DesktopPane = 'chat' | 'code';

function dateLabel(timestamp: number) {
  try { return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
  catch { return ''; }
}

function normalizeMessages(raw: unknown): AppBuilderMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((value, index) => {
    if (!value || typeof value !== 'object') return [];
    const item = value as Record<string, unknown>;
    if (!['user', 'assistant'].includes(String(item.role)) || typeof item.content !== 'string') return [];
    const timestamp = typeof item.timestamp === 'number' ? item.timestamp : Date.parse(String(item.timestamp));
    return [{
      id: typeof item.id === 'string' && item.id ? item.id : `message-${index}-${crypto.randomUUID()}`,
      role: item.role as 'user' | 'assistant',
      content: item.content,
      timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
      ...(Array.isArray(item.images) ? { images: item.images.filter((image): image is string => typeof image === 'string') } : {}),
      ...(Array.isArray(item.agentActions) ? { agentActions: item.agentActions } : {}),
    }];
  });
}

function nameFromMessages(messages: AppBuilderMessage[]) {
  return messages.find(message => message.role === 'user')?.content.replace(/\s+/g, ' ').trim().slice(0, 44) || 'Your new app';
}

function MessageCard({ message, compact = false }: { message: AppBuilderMessage; compact?: boolean }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} ${compact ? 'mb-2' : 'mb-4'}`}>
      <div className={`max-w-[88%] rounded-[18px] px-3.5 py-3 ${isUser ? 'rounded-br-md bg-white text-[#101110]' : 'rounded-bl-md border border-white/[0.08] bg-white/[0.045] text-white/80'}`}>
        <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">{message.content || 'Arc is working…'}</p>
        {message.images?.length ? <p className={`mt-2 text-[10px] ${isUser ? 'text-black/45' : 'text-white/35'}`}>{message.images.length} image{message.images.length === 1 ? '' : 's'} attached</p> : null}
        {!compact && <p className={`mt-1.5 text-[9px] ${isUser ? 'text-black/40' : 'text-white/28'}`}>{dateLabel(message.timestamp)}</p>}
      </div>
    </div>
  );
}

function DemoCode({ onClose }: { onClose?: () => void }) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-[#090a0a]">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3"><div><p className="text-sm font-medium text-white">Source files</p><p className="mt-0.5 text-[10px] text-white/35">Inspect or copy your app code</p></div>{onClose && <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-full text-white/55"><X className="h-4 w-4" /></Button>}</div>
      <div className="flex min-h-0 flex-1">
        <div className="w-36 shrink-0 overflow-auto border-r border-white/[0.06] p-2 sm:w-44">
          {['src/App.tsx', 'src/main.tsx', 'src/lib/netlifyDb.ts', 'src/components/NetlifyAuthModal.tsx'].map((path, index) => <div key={path} className={`flex items-center gap-2 rounded-lg px-2 py-2.5 text-[10px] ${index === 0 ? 'bg-white/[0.08] text-white/90' : 'text-white/42'}`}><FileCode2 className="h-3 w-3 shrink-0" /><span className="truncate">{path.split('/').at(-1)}</span></div>)}
        </div>
        <div className="min-w-0 flex-1 overflow-auto p-4 font-mono text-[11px] leading-[1.9] text-white/55"><span className="text-violet-300">import</span> React from <span className="text-emerald-300">'react'</span>;{`\n\n`}<span className="text-violet-300">export default function</span> <span className="text-sky-300">App</span>() {'{'}{`\n`}  <span className="text-violet-300">return</span> ({`\n`}    &lt;<span className="text-amber-200">main</span> className=<span className="text-emerald-300">"habit-dashboard"</span>&gt;{`\n`}      &lt;<span className="text-amber-200">WeekStreak</span> days={'{'}days{'}'} /&gt;{`\n`}      &lt;<span className="text-amber-200">HabitList</span> habits={'{'}habits{'}'} /&gt;{`\n`}    &lt;/<span className="text-amber-200">main</span>&gt;{`\n`}  );{`\n`}{'}'}</div>
      </div>
    </div>
  );
}

interface AppBuilderWorkspaceProps {
  projectId?: string;
  onClose?: () => void;
  demo?: boolean;
}

export function AppBuilderWorkspace({ projectId: propProjectId, onClose, demo = false }: AppBuilderWorkspaceProps) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { hasBoost, isAdmin, loading: subscriptionLoading, openCheckout } = useSubscription();
  const isEntitled = demo || hasBoost || isAdmin;
  const storeProjectId = useIDEStore(state => state.ideProjectId);
  const idePrompt = useIDEStore(state => state.idePrompt);
  const ideAutoRunPrompt = useIDEStore(state => state.ideAutoRunPrompt);
  const clearIdePrompt = useIDEStore(state => state.clearIdePrompt);
  const closeIDE = useIDEStore(state => state.closeIDE);
  const setIdeProjectId = useIDEStore(state => state.setIdeProjectId);
  const initialProjectId = propProjectId || storeProjectId || crypto.randomUUID();
  const [activeProjectId, setActiveProjectId] = useState(initialProjectId);
  const projectIdRef = useRef(activeProjectId);
  projectIdRef.current = activeProjectId;
  const [files, setFiles] = useState<VirtualFileSystem>(() => demo ? DEFAULT_FILES : ensureAppBuilderSystemFiles(useIDEStore.getState().ideFiles || DEFAULT_FILES));
  const filesRef = useRef(files);
  filesRef.current = files;
  const [messages, setMessages] = useState<AppBuilderMessage[]>(() => demo ? DEMO_MESSAGES : normalizeMessages(useIDEStore.getState().ideMessages));
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [projectLoaded, setProjectLoaded] = useState(demo);
  const [loadingProject, setLoadingProject] = useState(!demo);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved');
  const [saveError, setSaveError] = useState('');
  const [projectMetadata, setProjectMetadata] = useState<AppBuilderProjectMetadata>({ title: 'Your new app', prompt: 'Arc App', favicon_label: 'Rocket' });
  const [deployedUrl, setDeployedUrl] = useState<string | null>(null);
  const [netlifySiteId, setNetlifySiteId] = useState<string | null>(null);
  const [netlifySubdomain, setNetlifySubdomain] = useState<string | null>(null);
  const [showPublish, setShowPublish] = useState(false);
  const [showUnpublish, setShowUnpublish] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [previewSize, setPreviewSize] = useState<PreviewSize>(isMobile ? 'phone' : 'desktop');
  const [desktopPane, setDesktopPane] = useState<DesktopPane>('chat');
  const [prompt, setPrompt] = useState('');
  const [selectedFile, setSelectedFile] = useState('src/App.tsx');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [agentBusy, setAgentBusy] = useState(false);
  const [runView, setRunView] = useState<CloudAppRunView>({ busy: false });
  const [previewError, setPreviewError] = useState('');
  const [gitDialog, setGitDialog] = useState(false);
  const [targetPlatform, setTargetPlatform] = useState('Netlify');
  const [targetDatabase, setTargetDatabase] = useState('Arc app database');
  const projectPersistenceRef = useRef<LoadedAppBuilderProject['persistence']>(null);
  const saveTimerRef = useRef<number | null>(null);
  const saveInFlightRef = useRef<Promise<void> | null>(null);
  const appRunsRef = useRef<CloudAppRuns | null>(null);
  const syncedRunStatesRef = useRef(new Set<string>());
  const didAutoRunRef = useRef(false);
  const userIdRef = useRef<string | null>(null);

  const updateFiles = useCallback((next: VirtualFileSystem) => {
    filesRef.current = next;
    setFiles(next);
    useIDEStore.getState().setIdeFiles(next);
  }, []);
  const updateMessages = useCallback((next: AppBuilderMessage[]) => {
    messagesRef.current = next;
    setMessages(next);
    useIDEStore.getState().setIdeMessages(next);
  }, []);

  useEffect(() => {
    if (!demo && !storeProjectId && !propProjectId) setIdeProjectId(activeProjectId);
  }, [activeProjectId, demo, propProjectId, setIdeProjectId, storeProjectId]);

  useEffect(() => {
    setPreviewSize(isMobile ? 'phone' : 'desktop');
  }, [isMobile]);

  useEffect(() => {
    if (demo) return;
    const requestedProjectId = propProjectId || storeProjectId;
    if (!requestedProjectId || requestedProjectId === projectIdRef.current) return;

    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    appRunsRef.current?.close();
    appRunsRef.current = null;
    projectIdRef.current = requestedProjectId;
    userIdRef.current = null;
    projectPersistenceRef.current = null;
    syncedRunStatesRef.current.clear();
    setOwnerId(null);
    setProjectLoaded(false);
    setLoadingProject(true);
    setSaveState('saved');
    setSaveError('');
    setRunView({ busy: false });
    setProjectMetadata({ title: 'Your new app', prompt: 'Arc App', favicon_label: 'Arc' });
    setDeployedUrl(null);
    setNetlifySiteId(null);
    setNetlifySubdomain(null);
    updateFiles(ensureAppBuilderSystemFiles(DEFAULT_FILES));
    updateMessages([]);
    setActiveProjectId(requestedProjectId);
  }, [demo, propProjectId, storeProjectId, updateFiles, updateMessages]);

  useEffect(() => {
    projectIdRef.current = activeProjectId;
    if (demo) {
      updateFiles(DEFAULT_FILES);
      updateMessages(DEMO_MESSAGES);
      setProjectMetadata({ title: 'Morrow habits', prompt: DEMO_MESSAGES[0].content, favicon_label: 'Arc', seo_description: 'Small steps, every day.', hide_badge: false });
      setDeployedUrl(null);
      setNetlifySiteId(null);
      setNetlifySubdomain(null);
      setProjectLoaded(true);
      setLoadingProject(false);
      return;
    }
    if (subscriptionLoading || !isEntitled) {
      setLoadingProject(subscriptionLoading);
      setProjectLoaded(false);
      return;
    }
    const controller = new AbortController();
    setLoadingProject(true);
    setProjectLoaded(false);
    setSaveError('');
    void (async () => {
      if (!UUID.test(activeProjectId)) throw new Error('This app link is invalid.');
      const loaded = await loadAppBuilderProject(activeProjectId, controller.signal);
      if (controller.signal.aborted || projectIdRef.current !== activeProjectId) return;
      userIdRef.current = loaded.ownerId;
      setOwnerId(loaded.ownerId);
      projectPersistenceRef.current = loaded.persistence;
      updateFiles(loaded.files);
      updateMessages(loaded.messages);
      if (loaded.row) {
        const versions = loaded.row.versions && typeof loaded.row.versions === 'object' ? loaded.row.versions as Record<string, unknown> : {};
        const meta: AppBuilderProjectMetadata = {
          title: loaded.row.title || nameFromMessages(loaded.messages),
          prompt: loaded.row.prompt || nameFromMessages(loaded.messages),
          netlify_url: loaded.row.netlify_url,
          netlify_site_id: loaded.row.netlify_site_id,
          netlify_subdomain: loaded.row.netlify_subdomain,
          favicon_label: loaded.row.favicon_label,
          seo_description: typeof versions.seo_description === 'string' ? versions.seo_description : '',
          hide_badge: versions.hide_badge === true,
        };
        setProjectMetadata(meta);
        setDeployedUrl(loaded.row.netlify_url || null);
        setNetlifySiteId(loaded.row.netlify_site_id || null);
        setNetlifySubdomain(loaded.row.netlify_subdomain || null);
        if (loaded.pending) {
          setSaveState('error');
          setSaveError('Pending local edits were restored. They are preserved while Arc reconnects to the saved version.');
        }
      } else {
        setProjectMetadata({ title: nameFromMessages(messagesRef.current), prompt: nameFromMessages(messagesRef.current), favicon_label: 'Arc' });
        setDeployedUrl(null);
        setNetlifySiteId(null);
        setNetlifySubdomain(null);
      }
      setProjectLoaded(true);
    })().catch(error => {
      if (controller.signal.aborted) return;
      setSaveState('error');
      setSaveError(error instanceof Error ? error.message : 'The app could not be loaded.');
    }).finally(() => {
      if (!controller.signal.aborted) setLoadingProject(false);
    });
    return () => controller.abort();
  }, [activeProjectId, demo, isEntitled, subscriptionLoading, updateFiles, updateMessages]);

  const persistSnapshot = useCallback(async (nextFiles = filesRef.current, nextMessages = messagesRef.current) => {
    if (demo) return;
    if (saveInFlightRef.current) {
      await saveInFlightRef.current;
      return persistSnapshot(nextFiles, nextMessages);
    }
    const operation = (async () => {
      const currentOwner = userIdRef.current || ownerId;
      if (!currentOwner) throw new Error('Sign in to save this app.');
      setSaveState('saving');
      const firstPrompt = nextMessages.find(message => message.role === 'user')?.content || 'Arc App';
      const projectName = projectMetadata.title && projectMetadata.title !== 'Your new app' ? projectMetadata.title : firstPrompt.replace(/\s+/g, ' ').slice(0, 100);
      const metadata = { ...projectMetadata, title: projectName || 'Arc App', prompt: firstPrompt };
      const result = await saveAppBuilderProject(activeProjectId, currentOwner, nextFiles, nextMessages, metadata, projectPersistenceRef.current);
      if (projectIdRef.current !== activeProjectId || userIdRef.current !== currentOwner) throw new Error('App selection changed before save completed.');
      projectPersistenceRef.current = result.persistence;
      userIdRef.current = currentOwner;
      setOwnerId(currentOwner);
      setProjectMetadata(metadata);
      setSaveState('saved');
      setSaveError('');
      setProjectLoaded(true);
    })();
    saveInFlightRef.current = operation;
    try { await operation; }
    catch (error) {
      setSaveState('error');
      setSaveError(error instanceof Error ? error.message : 'App save failed; your local edits are still here.');
      throw error;
    } finally {
      if (saveInFlightRef.current === operation) saveInFlightRef.current = null;
    }
  }, [activeProjectId, demo, ownerId, projectMetadata]);

  useEffect(() => {
    if (demo || !projectLoaded || !ownerId) return;
    setSaveState('unsaved');
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void persistSnapshot().catch(() => {});
    }, 1200);
    return () => { if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current); };
  }, [files, messages, projectLoaded, ownerId, demo, persistSnapshot]);

  useEffect(() => {
    if (demo || !durableAppsEnabled || !ownerId || !projectLoaded) return;
    let alive = true;
    const coordinator = createCloudAppRuns(ownerId, activeProjectId, true, view => { if (alive) setRunView(view); });
    appRunsRef.current = coordinator;
    void coordinator.restore().catch(error => {
      if (alive) setRunView(previous => ({ ...previous, error: error instanceof Error ? error.message : 'Could not reconnect to this build.' }));
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user.id !== ownerId) {
        coordinator.close();
        if (alive) setRunView({ busy: false, error: 'Sign in again to continue this app.' });
      }
    });
    return () => {
      alive = false;
      listener.subscription.unsubscribe();
      coordinator.close();
      if (appRunsRef.current === coordinator) appRunsRef.current = null;
    };
  }, [activeProjectId, demo, ownerId, projectLoaded]);

  useEffect(() => {
    const entry = runView.entry;
    const run = entry?.run;
    if (!durableAppsEnabled || !entry || !run || entry.kind !== 'app' || run.projectId !== activeProjectId) return;
    const key = `${entry.id}:${run.status}`;
    if (syncedRunStatesRef.current.has(key)) return;
    let active = true;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || user.id !== ownerId) return;
      const { data, error } = await supabase.from('chat_sessions').select('messages').eq('id', entry.sessionId).eq('user_id', user.id).maybeSingle();
      if (!active || error || !data || projectIdRef.current !== activeProjectId) return;
      const result = run.result && typeof run.result === 'object' ? run.result as Record<string, unknown> : {};
      const choices = Array.isArray(result.choices) ? result.choices : [];
      const first = choices[0] && typeof choices[0] === 'object' ? choices[0] as Record<string, unknown> : {};
      const assistant = first.message && typeof first.message === 'object' ? first.message as Record<string, unknown> : {};
      const timestamp = Date.parse(run.updatedAt ?? run.createdAt ?? '') || Date.now();
      const transcript = cloudAppTranscript(data.messages, { runId: entry.id, status: run.status, timestamp, audit: run.checkpoint?.audit, summary: typeof assistant.content === 'string' ? assistant.content : undefined }) as AppBuilderMessage[];
      if (!active) return;
      updateMessages(transcript);
      const finalActions = cloudAuditActions(run.checkpoint?.audit, entry.id, timestamp) as AgentAction[];
      if (finalActions.length) setRunView(previous => ({ ...previous, entry: previous.entry ? { ...previous.entry } : undefined }));
      void persistSnapshot(filesRef.current, transcript).catch(() => {});
      syncedRunStatesRef.current.add(key);
    })();
    return () => { active = false; };
  }, [activeProjectId, ownerId, persistSnapshot, runView.entry, updateMessages]);

  const hasApp = demo || messages.some(message => message.role === 'user') || Object.keys(files).some(path => !Object.keys(DEFAULT_FILES).includes(path));
  const appName = projectMetadata.title && projectMetadata.title !== 'Your new app' ? projectMetadata.title : nameFromMessages(messages);
  const currentFileContent = files[selectedFile]?.content ?? '';
  const cloudActive = runView.busy || Boolean(runView.entry?.run && !['completed', 'failed', 'cancelled'].includes(runView.entry.run.status));
  const pendingApproval = runView.entry?.run?.checkpoint?.pendingApproval;
  const handoffText = useMemo(() => `I want to continue an Arc App Builder project in my own Git repository.\n\nBefore making changes, inspect the exported project and preserve its existing behavior. Target platform: ${targetPlatform}. Data/auth: ${targetDatabase}.\n\nThe current published askarc.chat link belongs to Arc App Builder only and will not host the Git version. Help me wire the project to my own ${targetPlatform} account. Do not publish or change production until I explicitly approve. Identify any Arc-provided database or auth helpers that need to be replaced, explain each change, and give me a preview/build check before opening a pull request.`, [targetDatabase, targetPlatform]);

  const handleClose = () => {
    closeIDE();
    if (onClose) onClose();
    else navigate('/dashboard?tab=apps');
  };

  const handleSend = async (messageText = prompt, imageList = attachments) => {
    const trimmed = messageText.trim();
    if (!trimmed || agentBusy || cloudActive) return;
    if (subscriptionLoading) return;
    if (!isEntitled) { openCheckout(); return; }
    if (!ownerId && !demo) { setSaveError('Sign in to build this app.'); return; }
    if (durableAppsEnabled && imageList.length) { setSaveError('Cloud app builds currently accept text only. Remove the images before sending this change.'); return; }
    setSaveError('');
    const userMessage: AppBuilderMessage = { id: crypto.randomUUID(), role: 'user', content: trimmed, timestamp: Date.now(), ...(imageList.length ? { images: imageList } : {}) };
    const assistantMessage: AppBuilderMessage = { id: crypto.randomUUID(), role: 'assistant', content: '', timestamp: Date.now() };
    const previousMessages = messagesRef.current;
    const nextMessages = [...previousMessages, userMessage, assistantMessage];
    updateMessages(nextMessages);
    setPrompt('');
    setAttachments([]);
    setAgentBusy(true);
    try {
      if (!demo) {
        await persistSnapshot(filesRef.current, previousMessages);
        if (!appRunsRef.current) throw new Error('This app build service is still connecting. Try again in a moment.');
        await appRunsRef.current.start(trimmed, 'ask', { files: filesRef.current, messages: previousMessages });
        setAgentBusy(false);
        return;
      }

      if (demo) {
        const updated = { ...filesRef.current, 'src/App.tsx': { ...filesRef.current['src/App.tsx'], content: `import React from 'react';\nexport default function App(){ return <main className="min-h-screen grid place-items-center"><h1>${trimmed.slice(0, 36).replace(/[<>]/g, '')}</h1></main>; }` } };
        updateFiles(ensureAppBuilderSystemFiles(updated));
        const final = nextMessages.map(item => item.id === assistantMessage.id ? { ...item, content: 'I updated the app preview. What would you like to adjust next?' } : item);
        updateMessages(final);
        return;
      }

      throw new Error('Cloud App Builder is not enabled for this app build.');
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'The build did not finish.';
      updateMessages(messagesRef.current.map(item => item.id === assistantMessage.id ? { ...item, content: `I couldn't finish that change. ${reason}` } : item));
      setSaveError(reason);
    } finally {
      setAgentBusy(false);
      if (!demo) void persistSnapshot().catch(() => {});
    }
  };

  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;

  useEffect(() => {
    if (demo || !idePrompt || !ideAutoRunPrompt || subscriptionLoading || !projectLoaded || didAutoRunRef.current) return;
    didAutoRunRef.current = true;
    clearIdePrompt();
    void handleSendRef.current(idePrompt, []);
  }, [clearIdePrompt, demo, ideAutoRunPrompt, idePrompt, projectLoaded, subscriptionLoading]);

  const onPublish = async (input: { title: string; subdomain: string; description: string; hideBadge: boolean; faviconLabel: string; faviconSvg: string }) => {
    if (demo) throw new Error('This is a local design preview. Publishing is disabled here.');
    if (!ownerId) throw new Error('Sign in to publish this app.');
    setPublishing(true);
    try {
      await persistSnapshot();
      const result = await deployToNetlify(input.title, filesRef.current, input.subdomain, netlifySiteId, input.title, input.faviconSvg, input.description, input.hideBadge, activeProjectId);
      const nextMetadata = { ...projectMetadata, title: input.title, prompt: projectMetadata.prompt || nameFromMessages(messagesRef.current), favicon_label: input.faviconLabel, seo_description: input.description, hide_badge: input.hideBadge, netlify_url: result.url, netlify_site_id: result.siteId, netlify_subdomain: result.subdomain };
      const saved = await saveAppBuilderProject(activeProjectId, ownerId, filesRef.current, messagesRef.current, nextMetadata, projectPersistenceRef.current);
      projectPersistenceRef.current = saved.persistence;
      setProjectMetadata(nextMetadata);
      setDeployedUrl(result.url);
      setNetlifySiteId(result.siteId);
      setNetlifySubdomain(result.subdomain);
      setSaveState('saved');
      setSaveError('');
    } finally {
      setPublishing(false);
    }
  };

  const handleUnpublish = async () => {
    if (!netlifySiteId || !ownerId) return;
    setPublishing(true);
    try {
      await unpublishFromNetlify(netlifySiteId);
      const nextMetadata = { ...projectMetadata, netlify_url: null, netlify_site_id: null, netlify_subdomain: null };
      const result = await saveAppBuilderProject(activeProjectId, ownerId, filesRef.current, messagesRef.current, nextMetadata, projectPersistenceRef.current);
      projectPersistenceRef.current = result.persistence;
      setProjectMetadata(nextMetadata);
      setDeployedUrl(null);
      setNetlifySiteId(null);
      setNetlifySubdomain(null);
      setShowUnpublish(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'The app could not be unpublished.');
    } finally {
      setPublishing(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try { await exportProjectAsZip(appName, filesRef.current); }
    catch (error) { setSaveError(error instanceof Error ? error.message : 'The source export failed.'); }
    finally { setExporting(false); }
  };

  const copyCode = async () => {
    const content = Object.entries(filesRef.current).map(([path, file]) => `// === ${path} ===\n${file.content}`).join('\n\n');
    await navigator.clipboard.writeText(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const addImages = async (list: FileList | null) => {
    if (!list) return;
    const imageFiles = Array.from(list).filter(file => file.type.startsWith('image/')).slice(0, 4);
    const encoded = await Promise.all(imageFiles.map(file => new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Image could not be read.'));
      reader.onerror = () => reject(new Error('Image could not be read.'));
      reader.readAsDataURL(file);
    })));
    setAttachments(previous => [...previous, ...encoded].slice(0, 4));
  };

  const updateCurrentFile = (content: string) => {
    updateFiles({ ...filesRef.current, [selectedFile]: { ...(filesRef.current[selectedFile] || { language: 'typescript' }), content } });
  };

  const handleEditorMessage = async (text: string) => handleSend(text, []);
  const runStatus = runView.entry?.run?.status ?? (runView.busy ? 'connecting' : 'ready');
  const runActions = runView.entry?.run?.checkpoint?.audit;
  const liveAudit = Array.isArray(runActions) ? cloudAuditActions(runActions, runView.entry?.id || '', Date.now()) : [];

  const chatPanel = (
    <div className="flex h-full min-h-0 flex-col bg-[#0c0d0c]">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3.5">
        <div><p className="text-[13px] font-semibold tracking-tight text-white">Build with Arc</p><p className="mt-0.5 text-[10px] text-white/35">Describe the app or ask for a change</p></div>
        {durableAppsEnabled && <span className="rounded-full border border-white/10 px-2 py-1 text-[9px] text-white/45">{runStatus}</span>}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {messages.length === 0 ? <div className="flex h-full min-h-[260px] flex-col justify-end pb-2"><p className="mb-1 text-xs text-white/35">A good place to start</p><p className="max-w-[280px] text-lg font-medium leading-snug tracking-tight text-white/90">What do you want your app to do?</p><div className="mt-4 flex flex-wrap gap-2">{['A habit tracker', 'A simple shop', 'An event page'].map(chip => <button key={chip} onClick={() => setPrompt(`Build ${chip.toLowerCase()} `)} className="rounded-full border border-white/10 bg-white/[0.025] px-3 py-2 text-[10px] text-white/55 hover:bg-white/[0.06]">{chip}</button>)}</div></div> : messages.map(message => <MessageCard key={message.id} message={message} />)}
          {agentBusy && <p className="ml-1 flex items-center gap-2 pb-2 text-[10px] text-white/40"><LoaderCircle className="h-3 w-3 animate-spin" /> Arc is making changes</p>}
          {cloudActive && <div className="mb-3 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5 text-[10px] text-white/55">{runStatus === 'awaiting_input' ? 'Arc needs your approval before continuing.' : `Build status: ${runStatus}`}</div>}
          {liveAudit.slice(-3).map(action => <p key={action.id} className="mb-2 text-[10px] text-white/40">{action.message}</p>)}
          {pendingApproval && <div className="mb-3 rounded-xl border border-amber-200/15 bg-amber-100/[0.04] p-3"><p className="text-xs font-medium text-amber-100/80">Approval needed</p><p className="mt-1 text-[10px] text-white/45">{pendingApproval.name}</p><div className="mt-3 flex gap-2"><Button size="sm" disabled={runView.busy} onClick={() => void appRunsRef.current?.decide('approve')} className="h-8 flex-1 bg-white text-black hover:bg-white/90">Approve</Button><Button size="sm" variant="outline" disabled={runView.busy} onClick={() => void appRunsRef.current?.decide('deny')} className="h-8 flex-1 border-white/10 text-white/60">Deny</Button></div></div>}
          {runView.error && <p role="alert" className="rounded-xl border border-red-300/15 bg-red-200/[0.04] px-3 py-2 text-[10px] text-red-100/70">{runView.error}</p>}
        </div>
        <div className="border-t border-white/[0.07] p-3.5">
          {saveError && <p role="alert" className="mb-2 line-clamp-2 text-[10px] text-amber-100/65">{saveError}</p>}
          <div className="rounded-[18px] border border-white/10 bg-[#151615] p-2 focus-within:border-white/25">
            {attachments.length > 0 && <div className="mb-2 flex gap-1.5">{attachments.map((image, index) => <div key={`${index}`} className="relative h-10 w-10 overflow-hidden rounded-lg"><img src={image} alt="Attached reference" className="h-full w-full object-cover" /><button onClick={() => setAttachments(items => items.filter((_, itemIndex) => itemIndex !== index))} className="absolute right-0 top-0 rounded-full bg-black/70 p-0.5 text-white"><X className="h-3 w-3" /></button></div>)}</div>}
            <Textarea value={prompt} onChange={event => setPrompt(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void handleSend(); } }} placeholder="Make a change or ask Arc anything…" rows={2} className="max-h-28 min-h-[46px] resize-none border-0 bg-transparent px-2 py-2 text-[13px] text-white placeholder:text-white/30 focus-visible:ring-0" />
            <div className="flex items-center justify-between px-1 pt-1">
              <label className="flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-2 text-[10px] text-white/40 hover:bg-white/[0.06] hover:text-white/75"><Upload className="h-3.5 w-3.5" /> Add image<input type="file" accept="image/*" multiple className="hidden" onChange={event => { void addImages(event.target.files); event.currentTarget.value = ''; }} /></label>
              <Button size="icon" onClick={() => void handleSend()} disabled={!prompt.trim() || agentBusy || cloudActive || (!demo && !ownerId)} className="h-8 w-8 rounded-xl bg-white text-black hover:bg-white/90 disabled:bg-white/10 disabled:text-white/25"><ArrowUp className="h-4 w-4" /></Button>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between px-1"><span className="text-[9px] text-white/25">Cloud build</span><span className="text-[9px] text-white/25">Luna · Medium</span></div>
        </div>
      </div>
    </div>
  );

  const codePanel = (
    <div className="flex h-full min-h-0 flex-col bg-[#0b0c0b]">
      <div className="shrink-0 border-b border-white/[0.07] px-4 py-3.5">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <div className="min-w-0"><p className="text-[13px] font-semibold text-white">App source</p><p className="mt-0.5 text-[10px] text-white/35">Code stays attached to this app</p></div>
          <Button variant="ghost" size="sm" onClick={() => setDesktopPane('chat')} aria-label="Return to app preview and chat" className="h-8 shrink-0 gap-1.5 text-[10px] text-white/65"><PanelRightClose className="h-3.5 w-3.5" /><span>Back to chat</span></Button>
        </div>
        <div className="mt-2 flex flex-wrap justify-end gap-1"><Button variant="ghost" size="sm" onClick={() => setGitDialog(true)} className="h-8 gap-1.5 text-[10px] text-white/55"><GitBranch className="h-3.5 w-3.5" />Git handoff</Button><Button variant="ghost" size="sm" onClick={() => void copyCode()} className="h-8 gap-1.5 text-[10px] text-white/55">{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? 'Copied' : 'Copy all'}</Button><Button variant="ghost" size="sm" onClick={() => void handleExport()} disabled={exporting} className="h-8 gap-1.5 text-[10px] text-white/55"><Upload className="h-3.5 w-3.5" />{exporting ? 'Packing…' : 'Export ZIP'}</Button></div>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="w-36 shrink-0 overflow-y-auto border-r border-white/[0.06] p-2 sm:w-44">{Object.keys(files).sort().map(path => <button key={path} onClick={() => setSelectedFile(path)} className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[10px] ${selectedFile === path ? 'bg-white/[0.08] text-white/90' : 'text-white/40 hover:bg-white/[0.035]'}`}><FileCode2 className="h-3 w-3 shrink-0" /><span className="truncate">{path}</span></button>)}</div>
        <div className="min-w-0 flex-1 p-2"><Textarea spellCheck={false} value={currentFileContent} onChange={event => updateCurrentFile(event.target.value)} className="h-full min-h-[280px] resize-none rounded-lg border-white/[0.07] bg-black/20 font-mono text-[11px] leading-relaxed text-white/75 focus-visible:ring-white/20" /></div>
      </div>
    </div>
  );

  if (!demo && !subscriptionLoading && !isEntitled) return <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#090a09] px-6 text-center text-white"><div className="max-w-sm"><p className="text-lg font-semibold">App Builder is part of Boost</p><p className="mt-2 text-sm text-white/45">Upgrade to build, edit, and publish private Arc apps.</p><Button onClick={() => openCheckout()} className="mt-5 rounded-full bg-white px-5 text-black hover:bg-white/90">Explore Boost</Button></div></div>;
  if (!demo && !durableAppsEnabled) return <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#090a09] px-6 text-center text-white"><div className="max-w-sm"><p className="text-lg font-semibold">App Builder cloud is not enabled</p><p className="mt-2 text-sm text-white/45">Return to Chat and try again later.</p><Button onClick={handleClose} className="mt-5 rounded-full bg-white px-5 text-black hover:bg-white/90">Back to Chat</Button></div></div>;
  if (!demo && loadingProject) return <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[#090a09] text-white"><div className="flex flex-col items-center gap-3"><LoaderCircle className="h-5 w-5 animate-spin text-white/60" /><span className="text-xs text-white/45">Opening your app</span></div></div>;

  return (
    <div className="app-builder-safe fixed inset-0 z-[200] flex flex-col overflow-hidden bg-[#090a09] text-white" data-testid="app-builder-workspace">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.16] [background-image:radial-gradient(rgba(255,255,255,.12)_0.65px,transparent_0.65px)] [background-size:7px_7px]" />
      <header className="app-builder-topbar relative z-10 flex h-[58px] shrink-0 items-center justify-between border-b border-white/[0.07] bg-[#0a0b0a]/90 px-3 backdrop-blur-xl sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Button onClick={handleClose} variant="ghost" size="icon" aria-label="Back to all apps" title="Back to all apps" className="h-9 w-9 shrink-0 rounded-full text-white/55 hover:bg-white/[0.07] hover:text-white"><ArrowLeft className="h-4 w-4" /></Button>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06]"><Code2 className="h-4 w-4 text-white/75" /></div>
          <div className="min-w-0"><p className="truncate text-[12px] font-medium text-white/90">{appName}</p><p className="flex items-center gap-1.5 text-[9px] text-white/35"><span className={`h-1.5 w-1.5 rounded-full ${saveState === 'saved' ? 'bg-emerald-300/80' : saveState === 'error' ? 'bg-amber-300/80' : 'bg-white/40'}`} />{demo ? 'Sample app' : saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Saved locally · needs attention' : 'Saved'}</p></div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {deployedUrl && <a href={deployedUrl} target="_blank" rel="noreferrer" className="hidden items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1.5 text-[10px] text-white/55 hover:text-white sm:flex"><Globe className="h-3 w-3" /><span>Live</span><ExternalLink className="h-2.5 w-2.5" /></a>}
          {!isMobile && <Button variant="ghost" onClick={() => setDesktopPane(pane => pane === 'code' ? 'chat' : 'code')} className={`h-8 rounded-full px-3 text-[10px] ${desktopPane === 'code' ? 'bg-white text-black hover:bg-white/90' : 'text-white/55 hover:bg-white/[0.06] hover:text-white'}`}><Code2 className="mr-1.5 h-3.5 w-3.5" />{desktopPane === 'code' ? 'Close code' : 'Advanced'}</Button>}
          {deployedUrl && <button onClick={() => setShowUnpublish(true)} className="hidden text-[9px] text-white/30 hover:text-white/60 md:block">Unpublish</button>}
          <Button onClick={() => setShowPublish(true)} disabled={publishing || loadingProject || !projectLoaded} className="h-9 rounded-full bg-white px-3.5 text-[10px] font-semibold text-black hover:bg-white/90 sm:px-4 sm:text-[11px]"><Rocket className="mr-1.5 h-3.5 w-3.5" />{deployedUrl ? 'Publish update' : 'Publish'}</Button>
        </div>
      </header>

      <div className={`relative z-[1] flex min-h-0 flex-1 ${isMobile ? 'flex-col' : ''}`}>
        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/[0.06] px-3 sm:px-5">
            <div className="flex min-w-0 items-center gap-2 text-[10px] text-white/45"><LockKeyhole className="h-3 w-3 text-emerald-200/55" /><span className="truncate font-mono">{deployedUrl ? deployedUrl.replace(/^https?:\/\//, '') : `${activeProjectId.slice(0, 8)}.preview.arc`}</span><span className="hidden rounded-full border border-white/[0.07] px-1.5 py-0.5 text-[8px] text-white/30 sm:inline">LOCAL PREVIEW</span></div>
            {isMobile && cloudActive && <span className="ml-2 shrink-0 rounded-full border border-white/10 px-2 py-1 text-[9px] text-white/55">Building · {runStatus}</span>}
            {!isMobile && <div className="flex items-center gap-1 rounded-full border border-white/[0.07] bg-white/[0.025] p-1">{([
              ['phone', Smartphone], ['tablet', Tablet], ['desktop', Monitor],
            ] as const).map(([size, Icon]) => <button key={size} title={`${size} preview`} onClick={() => setPreviewSize(size)} className={`flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[9px] capitalize ${previewSize === size ? 'bg-white text-black' : 'text-white/40 hover:text-white/80'}`}><Icon className="h-3 w-3" /><span>{size}</span></button>)}</div>}
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[#080908] p-0 sm:p-5">
            <div className={`relative z-[1] h-full min-h-0 overflow-hidden border-white/[0.08] bg-[#090a0f] shadow-[0_22px_90px_rgba(0,0,0,.55)] ${isMobile ? 'w-full rounded-none border-0' : previewSize === 'phone' ? 'h-[min(100%,760px)] w-[min(100%,390px)] rounded-[34px] border p-2' : previewSize === 'tablet' ? 'h-[min(100%,690px)] w-[min(100%,850px)] rounded-[26px] border p-2' : 'h-full w-full rounded-xl border'}`}>
              {!isMobile && previewSize === 'phone' && <div className="pointer-events-none absolute left-1/2 top-3 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-black shadow-inner" />}
              <div className={`h-full w-full overflow-hidden bg-[#090a0f] ${isMobile ? '' : previewSize === 'phone' ? 'rounded-[27px]' : previewSize === 'tablet' ? 'rounded-[19px]' : 'rounded-lg'}`}>
                <AppBuilderPreview files={files} projectId={activeProjectId} size={previewSize} isMobile={isMobile} hasApp={hasApp} demo={demo} onError={setPreviewError} />
              </div>
              {(previewError || (isMobile && saveError)) && <div role="alert" className="absolute bottom-3 left-3 right-3 z-20 flex items-center gap-2 rounded-xl border border-amber-200/15 bg-[#16130d]/90 px-3 py-2 text-[10px] text-amber-100/75 backdrop-blur"><CircleHelp className="h-3.5 w-3.5 shrink-0" />{previewError ? `Preview issue: ${previewError}` : saveError}</div>}
            </div>
            <div className="pointer-events-none absolute bottom-4 left-1/2 z-0 hidden -translate-x-1/2 text-[9px] text-white/20 sm:block">Browser preview · code runs on this device</div>
          </div>
          {!isMobile && <div className="flex h-[42px] shrink-0 items-center justify-between border-t border-white/[0.06] px-5"><div className="flex items-center gap-2 text-[10px] text-white/35"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300/75" />{cloudActive ? `Arc is building · ${runStatus}` : hasApp ? 'Preview is up to date' : 'Ready when you are'}{!demo && saveError && <span className="text-amber-100/60">· {saveError}</span>}</div><div className="flex items-center gap-3 text-[9px] text-white/30"><span>Web app</span><span>·</span><span>Local preview</span></div></div>}
        </main>

        {!isMobile && <aside className="w-[min(390px,36vw)] shrink-0 border-l border-white/[0.07]">{desktopPane === 'chat' ? chatPanel : codePanel}</aside>}
      </div>

      <AppBuilderPublishDialog open={showPublish} demo={demo} onOpenChange={setShowPublish} currentTitle={appName} currentSubdomain={netlifySubdomain} currentDescription={projectMetadata.seo_description || ''} currentHideBadge={projectMetadata.hide_badge === true} currentFavicon={projectMetadata.favicon_label || 'Rocket'} publishedUrl={deployedUrl} onPublish={onPublish} />

      <AnimatePresence>{showUnpublish && <motion.div className="fixed inset-0 z-[230] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><motion.div initial={{ scale: 0.97, y: 8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.98, y: 6 }} className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#111211] p-5 shadow-2xl"><p className="text-base font-semibold">Take this app offline?</p><p className="mt-2 text-xs leading-relaxed text-white/45">The {deployedUrl?.replace(/^https?:\/\//, '')} link will stop working. You can publish it again later.</p><div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setShowUnpublish(false)} className="text-white/60">Keep live</Button><Button disabled={publishing} onClick={() => void handleUnpublish()} className="bg-white text-black hover:bg-white/90">{publishing ? 'Unpublishing…' : 'Unpublish'}</Button></div></motion.div></motion.div>}</AnimatePresence>

      <AppBuilderGitHandoff
        open={gitDialog}
        onOpenChange={setGitDialog}
        projectId={activeProjectId}
        demo={demo}
        exporting={exporting}
        onExport={handleExport}
        onPrepareHandoff={async () => {
          if (agentBusy || cloudActive) throw new Error('Wait for Arc to finish editing before creating the Git draft.');
          await persistSnapshot();
        }}
        targetPlatform={targetPlatform}
        onTargetPlatformChange={setTargetPlatform}
        targetDatabase={targetDatabase}
        onTargetDatabaseChange={setTargetDatabase}
        handoffText={handoffText}
      />
    </div>
  );
}
