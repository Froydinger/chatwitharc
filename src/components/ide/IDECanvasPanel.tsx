import { useState, useCallback, useEffect, useRef } from 'react';
import { useArcStore } from '@/store/useArcStore';
import { useSubscription } from '@/hooks/useSubscription';
import { 
  ArrowLeft, Code2, Eye, Download, Copy, Check, Sparkles, Cloud, Trash2, Rocket, Plus, ExternalLink, Calendar, Loader2, Play, GitBranch, ChevronDown, FolderArchive, MessageSquare, MoreVertical, X 
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { exportProjectAsZip } from '@/lib/exportZip';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useIDEStore } from '@/store/useIDEStore';
import { ThemedLogo } from '@/components/ThemedLogo';
import { shouldReserveDesktopTrafficLightSpace } from '@/utils/platform';
import { IDECodeEditor } from './IDECodeEditor';
import { IDEPreviewPanel } from './IDEPreviewPanel';
import { IDEChatPanel } from './IDEChatPanel';
import { PublishDialog } from './PublishDialog';
import { IDECloudPanel } from './IDECloudPanel';
import { sendAgentMessage, type AgentResult } from '@/services/agent';
import { deployToNetlify, unpublishFromNetlify } from '@/lib/deploy';
import { supabase } from '@/integrations/supabase/client';
import type { VirtualFileSystem, AgentAction } from '@/types/ide';
import { DEFAULT_FILES } from '@/types/ide';
import { cloudAppProjectClient, CLOUD_APP_PROJECT_RELOADED } from '@/services/cloudAppProjectClient';
import { normalizeAppProjectSnapshot, type CloudAppProjectPersistence } from '@/services/cloudAppProjects';
import { createCloudAppRuns } from '@/services/cloudAppRunClient';
import type { CloudAppRuns, CloudAppRunView } from '@/services/cloudAppRuns';

const durableAppsEnabled = import.meta.env.VITE_CLOUD_APP_RUNS_ENABLED === 'true';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  images?: string[];
  timestamp: number;
  agentActions?: AgentAction[];
}

interface LovableProject {
  id: string;
  title: string;
  prompt: string;
  netlify_url?: string | null;
  netlify_site_id?: string | null;
  netlify_subdomain?: string | null;
  created_at: string;
  files: any;
  messages: any;
  versions?: any;
}

interface IDECanvasPanelProps {
  className?: string;
  onClose?: () => void;
  projectId?: string;
}

const buildPersistenceSnapshot = (nextFiles: VirtualFileSystem, nextMessages: ChatMessage[], nextProjectId?: string | null) =>
  JSON.stringify({ projectId: nextProjectId, files: nextFiles, messages: nextMessages });

export function ensureSystemFiles(vfs: VirtualFileSystem): VirtualFileSystem {
  let changed = false;
  const next = { ...vfs };

  const dbFile = next['src/lib/netlifyDb.ts'];
  if (!dbFile?.content || !dbFile.content.includes('syncCloud') || !dbFile.content.includes('getAllStoredUsers')) {
    next['src/lib/netlifyDb.ts'] = DEFAULT_FILES['src/lib/netlifyDb.ts'];
    changed = true;
  }

  const authFile = next['src/components/NetlifyAuthModal.tsx'];
  if (!authFile?.content || !authFile.content.includes('export function NetlifyAuthModal')) {
    next['src/components/NetlifyAuthModal.tsx'] = DEFAULT_FILES['src/components/NetlifyAuthModal.tsx'];
    changed = true;
  }

  return changed ? next : vfs;
}

export function IDECanvasPanel({ className, onClose, projectId: propProjectId }: IDECanvasPanelProps) {
  const idePrompt = useIDEStore((s) => s.idePrompt);
  const ideAutoRunPrompt = useIDEStore((s) => s.ideAutoRunPrompt);
  const storeProjectId = useIDEStore((s) => s.ideProjectId);
  const closeIDE = useIDEStore((s) => s.closeIDE);
  const setIdeIsRunning = useIDEStore((s) => s.setIdeIsRunning);
  const setIdeActions = useIDEStore((s) => s.setIdeActions);
  const clearIdePrompt = useIDEStore((s) => s.clearIdePrompt);
  const setIdeProjectId = useIDEStore((s) => s.setIdeProjectId);

  // Synchronously resolve active project ID on initial render
  const initialProjectId = (() => {
    if (propProjectId) return propProjectId;
    if (storeProjectId) return storeProjectId;
    if (typeof window !== 'undefined') {
      const match = window.location.pathname.match(/\/build\/([a-zA-Z0-9_-]+)/);
      if (match?.[1] && match[1] !== 'new') return match[1];
      const searchParam = new URLSearchParams(window.location.search).get('projectId');
      if (searchParam) return searchParam;
    }
    return null;
  })();

  const ideProjectId = storeProjectId || initialProjectId;

  useEffect(() => {
    if (initialProjectId && !storeProjectId) {
      setIdeProjectId(initialProjectId);
    }
  }, [initialProjectId, storeProjectId, setIdeProjectId]);

  const { hasBoost, isAdmin, loading: subscriptionLoading, openCheckout } = useSubscription();
  const isMobileHook = useIsMobile();
  const [isMobileWindow, setIsMobileWindow] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 768 : false));
  useEffect(() => {
    const handleResize = () => setIsMobileWindow(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const isMobile = isMobileHook || isMobileWindow;
  const { toast } = useToast();

  const isProjectHydratedRef = useRef<boolean>(!ideProjectId);

  const [files, setFiles] = useState<VirtualFileSystem>(() => {
    const storeFiles = useIDEStore.getState().ideFiles;
    if (storeFiles && Object.keys(storeFiles).length > 0) {
      return ensureSystemFiles(storeFiles);
    }
    if (ideProjectId) {
      try {
        const cached = localStorage.getItem(`arc_ide_cached_files_${ideProjectId}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && Object.keys(parsed).length > 0) {
            return ensureSystemFiles(parsed);
          }
        }
      } catch {}
    }
    return ensureSystemFiles(DEFAULT_FILES);
  });
  const [selectedFile, setSelectedFile] = useState<string | null>('src/App.tsx');
  const [activeTab, setActiveTab] = useState<'chat' | 'preview' | 'code' | 'cloud'>('preview');
  const [copied, setCopied] = useState(false);

  // Default to chat tab on mobile, preview on desktop
  useEffect(() => {
    // Apply the responsive default only when the breakpoint changes. Including
    // activeTab here reset every mobile tap straight back to Chat.
    if (isMobile) {
      setActiveTab('chat');
    } else {
      setActiveTab((currentTab) => currentTab === 'chat' ? 'preview' : currentTab);
    }
  }, [isMobile]);
  
  const [messages, setMessagesRaw] = useState<ChatMessage[]>(() => {
    const storeMsgs = useIDEStore.getState().ideMessages;
    return storeMsgs?.length ? (storeMsgs as ChatMessage[]) : [];
  });
  const setMessages: typeof setMessagesRaw = useCallback((update) => {
    localEditEpochRef.current++;
    setMessagesRaw(prev => {
      const next = typeof update === 'function' ? update(prev) : update;
      useIDEStore.getState().setIdeMessages(next);
      return next;
    });
  }, []);

  const [liveActions, setLiveActions] = useState<AgentAction[]>([]);
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved');
  const syncStatusRef = useRef<'saved' | 'saving' | 'unsaved' | 'error'>('saved');
  
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [deployedUrl, setDeployedUrl] = useState<string | null>(null);
  const [netlifySiteId, setNetlifySiteId] = useState<string | null>(null);
  const [netlifySubdomain, setNetlifySubdomain] = useState<string | null>(null);
  const [publishedAppTitle, setPublishedAppTitle] = useState<string | null>(null);
  const [seoDescription, setSeoDescription] = useState<string>('');
  const [faviconLabel, setFaviconLabel] = useState<string>('Rocket');
  const [hideBadge, setHideBadge] = useState<boolean>(false);
  
  const [projects, setProjects] = useState<LovableProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [newProjectPrompt, setNewProjectPrompt] = useState('');
  const [reserveTrafficLightSpace, setReserveTrafficLightSpace] = useState(false);

  useEffect(() => {
    setReserveTrafficLightSpace(shouldReserveDesktopTrafficLightSpace());
  }, []);
  
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filesRef = useRef<VirtualFileSystem>(files);
  const messagesRef = useRef<ChatMessage[]>(messages);
  const autoFixedRef = useRef(false);
  const lastErrorRef = useRef<string | null>(null);
  const projectIdRef = useRef<string | null>(ideProjectId);
  const lastHydratedProjectIdRef = useRef<string | symbol | null>(Symbol());
  const lastSavedSnapshotRef = useRef(buildPersistenceSnapshot(files, messages));
  const didAutoRunInitialPromptRef = useRef(false);
  const projectScopeRef = useRef(new AbortController());
  const protectedProjectRef = useRef<{ id: string; owner: string; client: CloudAppProjectPersistence } | null>(null);
  const [projectSaveError, setProjectSaveError] = useState<string | null>(null);
  const [projectReloadVersion, setProjectReloadVersion] = useState(0);
  const localEditEpochRef = useRef(0);
  const appRunsRef = useRef<CloudAppRuns | null>(null);
  const [cloudRunView, setCloudRunView] = useState<CloudAppRunView>({ busy: false });
  const [cloudRunMode, setCloudRunMode] = useState<'ask' | 'auto'>('ask');
  const [cloudReady, setCloudReady] = useState(false);
  const [projectLoaded, setProjectLoaded] = useState(false);
  const cloudActive = cloudRunView.busy || !!(cloudRunView.entry && !['completed', 'failed', 'cancelled'].includes(cloudRunView.entry.run?.status ?? 'unknown'));

  useEffect(() => {
    setCloudReady(false);
    setCloudRunView({ busy: false });
    if (!durableAppsEnabled || !ideProjectId) return;
    let alive = true;
    let coordinator: CloudAppRuns | undefined;
    let owner: string | undefined;
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (owner && session?.user.id !== owner) {
        coordinator?.close(); appRunsRef.current = null;
        if (alive) { setCloudReady(false); setCloudRunView({ busy: false, error: 'Sign in again to reconnect this app.' }); }
      }
    });
    void (async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (!alive) return;
      if (error || !user) throw new Error('Sign in to use cloud builds.');
      owner = user.id;
      coordinator = createCloudAppRuns(owner, ideProjectId, durableAppsEnabled, view => { if (alive) setCloudRunView(view); });
      appRunsRef.current = coordinator;
      await coordinator.restore();
      if (alive) setCloudReady(true);
    })().catch(error => { if (alive) setCloudRunView({ busy: false, error: error instanceof Error ? error.message : 'App discovery failed.' }); });
    return () => { alive = false; authListener.subscription.unsubscribe(); coordinator?.close(); appRunsRef.current = null; };
  }, [ideProjectId]);

  useEffect(() => {
    const onReload = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      const active = protectedProjectRef.current;
      if (detail?.projectId !== projectIdRef.current || (active && detail?.ownerId !== active.owner)) return;
      // Preserve edits made since the last render before initiating authoritative hydration.
      try {
        if (active && lastSavedSnapshotRef.current !== buildPersistenceSnapshot(filesRef.current, messagesRef.current, active.id)) {
          active.client.capture({ files: filesRef.current, messages: messagesRef.current });
        }
        setProjectReloadVersion(value => value + 1);
      } catch (error) {
        setProjectSaveError(error instanceof Error ? error.message : 'Local edits could not be journaled.');
      }
    };
    window.addEventListener(CLOUD_APP_PROJECT_RELOADED, onReload);
    return () => window.removeEventListener(CLOUD_APP_PROJECT_RELOADED, onReload);
  }, []);

  // Keep refs in sync and update store
  useEffect(() => {
    filesRef.current = files;
    useIDEStore.getState().setIdeFiles(files);
  }, [files]);

  useEffect(() => {
    messagesRef.current = messages;
    useIDEStore.getState().setIdeMessages(messages);
  }, [messages]);

  useEffect(() => {
    if (!isAgentRunning) {
      autoFixedRef.current = false;
    }
  }, [isAgentRunning]);

  // Lock document body scroll while IDE is mounted
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);



  // Load user projects for the dashboard
  const fetchProjects = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      setLoadingProjects(true);
      const { data, error } = await supabase
        .from('ide_projects')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProjects(data || []);
    } catch (e) {
      console.error('Failed to fetch projects:', e);
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  useEffect(() => {
    if (!ideProjectId) {
      void fetchProjects();
    }
  }, [ideProjectId, fetchProjects]);

  // Hydrate files/messages whenever active project transitions
  useEffect(() => {
    if (lastHydratedProjectIdRef.current === ideProjectId) return;
    lastHydratedProjectIdRef.current = ideProjectId;

    let initialFiles = filesRef.current;
    let initialMessages = messagesRef.current;

    if (!ideProjectId) {
      const storeFiles = useIDEStore.getState().ideFiles;
      const storeMsgs = useIDEStore.getState().ideMessages;
      const currentPrompt = useIDEStore.getState().idePrompt;

      // When launching a fresh app with a prompt (e.g. from chat /build or App tool card),
      // NEVER resurrect dirty files or prior chat history from local snapshot!
      if (currentPrompt) {
        const freshAppId = crypto.randomUUID();
        projectIdRef.current = freshAppId;
        setIdeProjectId(freshAppId);
        initialFiles = DEFAULT_FILES;
        setFiles(DEFAULT_FILES);
        filesRef.current = DEFAULT_FILES;
        initialMessages = [];
        setMessagesRaw([]);
        messagesRef.current = [];
      } else if (storeFiles && Object.keys(storeFiles).length > 0) {
        initialFiles = ensureSystemFiles(storeFiles);
        setFiles(initialFiles);
        filesRef.current = initialFiles;
      } else {
        const savedLocal = localStorage.getItem('arc_ide_local_snapshot');
        if (savedLocal) {
          try {
            const parsed = JSON.parse(savedLocal);
            if (parsed.files && Object.keys(parsed.files).length > 0) {
              initialFiles = ensureSystemFiles(parsed.files);
              setFiles(initialFiles);
              filesRef.current = initialFiles;
            }
            if (parsed.messages && parsed.messages.length > 0) {
              initialMessages = parsed.messages;
              setMessagesRaw(parsed.messages);
              messagesRef.current = parsed.messages;
            }
            if (parsed.projectId) {
              projectIdRef.current = parsed.projectId;
              setIdeProjectId(parsed.projectId);
            }
          } catch (e) {
            console.error('Failed to parse local IDE snapshot:', e);
          }
        }
      }
      if (storeMsgs && storeMsgs.length > 0 && !currentPrompt) {
        initialMessages = storeMsgs;
        setMessagesRaw(storeMsgs as ChatMessage[]);
        messagesRef.current = storeMsgs as ChatMessage[];
      }
    } else {
      projectIdRef.current = ideProjectId;
      setSyncStatus('saved');

      const storeFiles = useIDEStore.getState().ideFiles;
      const storeMsgs = useIDEStore.getState().ideMessages;

      if (storeFiles && Object.keys(storeFiles).length > 0) {
        initialFiles = ensureSystemFiles(storeFiles);
        setFiles(initialFiles);
        filesRef.current = initialFiles;
      }

      if (storeMsgs && storeMsgs.length > 0) {
        initialMessages = storeMsgs;
        setMessagesRaw(storeMsgs as ChatMessage[]);
        messagesRef.current = storeMsgs as ChatMessage[];
      }
    }

    lastSavedSnapshotRef.current = buildPersistenceSnapshot(initialFiles, initialMessages);
  }, [ideProjectId]);

  // Load Netlify configuration on project load
  useEffect(() => {
    projectScopeRef.current.abort();
    const scope = new AbortController();
    projectScopeRef.current = scope;
    protectedProjectRef.current = null;
    setProjectLoaded(false);
    if (!ideProjectId) return () => scope.abort();
    isProjectHydratedRef.current = false;
    const epoch = localEditEpochRef.current;
    void (async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      scope.signal.throwIfAborted();
      if (authError || !user) throw new Error('Sign in to load this app.');
      const { data: row, error } = await supabase
      .from('ide_projects')
      .select('*')
      .eq('id', ideProjectId)
      .eq('user_id', user.id)
      .maybeSingle();
      scope.signal.throwIfAborted();
      if (error) throw error;
      if (!row) { isProjectHydratedRef.current = true; setProjectLoaded(true); return; } // New unsaved UUID project.
      let data: any = row;
      let pending = false;
      if ((data.cloud_managed || durableAppsEnabled) && Number.isSafeInteger(data.cloud_revision)) {
        const client = cloudAppProjectClient(user.id, ideProjectId, data.cloud_revision);
        const result = await client.reload(scope.signal);
        if (result.status === 'stale') throw new Error('App reload is older than saved edits.');
        pending = result.status === 'pending';
        data = result.status === 'reloaded' ? result.project : { ...data, ...result.snapshot };
        protectedProjectRef.current = { id: ideProjectId, owner: user.id, client };
      }
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      scope.signal.throwIfAborted();
      if (currentUser?.id !== user.id || projectIdRef.current !== ideProjectId) return;
      if (localEditEpochRef.current !== epoch && !pending) throw new Error('Local edits changed during app reload; save them before reloading.');

        setProjectLoaded(true);
        // Always hydrate files from database when loading a saved project
        if (data.files && typeof data.files === 'object') {
          const loadedFiles = data.cloud_managed ? data.files : ensureSystemFiles(data.files);
          setFiles(loadedFiles);
          filesRef.current = loadedFiles;
          useIDEStore.getState().setIdeFiles(loadedFiles);
          try {
            localStorage.setItem(`arc_ide_cached_files_${ideProjectId}`, JSON.stringify(loadedFiles));
          } catch {}
        }

        setDeployedUrl((data as any).netlify_url || null);
        setNetlifySiteId((data as any).netlify_site_id || null);
        setNetlifySubdomain((data as any).netlify_subdomain || null);
        if ((data as any).netlify_url && (data as any).title) {
          setPublishedAppTitle((data as any).title);
        } else if (!(data as any).netlify_url) {
          setPublishedAppTitle(null);
        }
        if ((data as any).favicon_label) {
          setFaviconLabel((data as any).favicon_label);
        }
        if ((data as any)?.versions && typeof (data as any).versions === 'object') {
          const v = (data as any).versions;
          if (v.seo_description) setSeoDescription(v.seo_description);
          if (v.hide_badge !== undefined) setHideBadge(!!v.hide_badge);
        }

        const appUsers = (data as any)?.versions?.app_users;
        if (Array.isArray(appUsers) && appUsers.length > 0) {
          const key = `netlify_mock_users:${ideProjectId}`;
          localStorage.setItem(key, JSON.stringify(appUsers));
          window.dispatchEvent(new CustomEvent('netlify-auth-change', { detail: { appId: ideProjectId, users: appUsers } }));
        }

        const appDb = (data as any)?.versions?.app_db;
        if (appDb && typeof appDb === 'object') {
          for (const [k, v] of Object.entries(appDb)) {
            try {
              localStorage.setItem(`netlify_db:${ideProjectId}:${k}`, JSON.stringify(v));
            } catch {}
          }
          window.dispatchEvent(new CustomEvent('netlify-db-change', { detail: { appId: ideProjectId } }));
        }

        const dbMessages = normalizeAppProjectSnapshot({ files: data.files, messages: data.messages ?? [] }).messages;
        if (Array.isArray(dbMessages)) {
          setMessagesRaw(dbMessages as ChatMessage[]);
          useIDEStore.getState().setIdeMessages(dbMessages as ChatMessage[]);
          messagesRef.current = dbMessages as ChatMessage[];
        }

        isProjectHydratedRef.current = true;
        lastSavedSnapshotRef.current = buildPersistenceSnapshot(
          data.cloud_managed ? data.files : ensureSystemFiles(data.files),
          dbMessages as ChatMessage[],
          ideProjectId
        );
        if (pending) {
          setSyncStatus('error');
          setProjectSaveError('Pending app edits restored. Save to retry; conflicts require reconciliation.');
        } else { setSyncStatus('saved'); setProjectSaveError(null); }
    })().catch(error => {
      if (scope.signal.aborted) return;
      setSyncStatus('error');
      setProjectSaveError(error instanceof Error ? error.message : 'App reload failed.');
    });
    return () => scope.abort();
  }, [ideProjectId, projectReloadVersion]);

  // Keep browser URL in sync with active project ID (/build/:projectId)
  useEffect(() => {
    if (ideProjectId && typeof window !== 'undefined' && !window.location.pathname.includes(ideProjectId)) {
      window.history.replaceState(null, '', `/build/${ideProjectId}`);
    }
  }, [ideProjectId]);

  // Auto-saving snapshot listener
  useEffect(() => {
    if (ideProjectId && !isProjectHydratedRef.current) return;

    const currentSnapshot = buildPersistenceSnapshot(files, messages, projectIdRef.current || ideProjectId);

    if (!ideProjectId) {
      localStorage.setItem('arc_ide_local_snapshot', currentSnapshot);
    }

    if (currentSnapshot !== lastSavedSnapshotRef.current) {
      setSyncStatus('unsaved');
      const protectedProject = protectedProjectRef.current;
      if (protectedProject?.id === ideProjectId) {
        try {
          protectedProject.client.capture({ files, messages });
        } catch (error) {
          setSyncStatus('error');
          setProjectSaveError(error instanceof Error ? error.message : 'App edits could not be stored locally.');
          return;
        }
      }

      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }

      autoSaveTimerRef.current = setTimeout(() => {
        void saveProject();
      }, 3000);
    }

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [files, messages, ideProjectId]);

  // Save changes to Supabase
  const saveProject = useCallback(async () => {
    const scope = projectScopeRef.current;
    const capturedProjectId = projectIdRef.current;
    const filesToPersist = structuredClone(filesRef.current);
    const messagesToPersist = structuredClone(messagesRef.current);
    try {
      // Capture before any await: a later edit must never be followed by this older snapshot.
      if (protectedProjectRef.current?.id === capturedProjectId) {
        protectedProjectRef.current.client.capture({ files: filesToPersist, messages: messagesToPersist });
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      scope.signal.throwIfAborted();
      if (projectIdRef.current !== capturedProjectId) return;

      setSyncStatus('saving');

      const firstPrompt = messagesToPersist.find((m) => m.role === 'user')?.content || 'Arc App';
      const projectTitle = firstPrompt ? firstPrompt.slice(0, 100) : 'Untitled Project';

      // Ensure valid UUID for ide_projects
      let pid = capturedProjectId;
      const isValidUUID = pid && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pid);
      if (!isValidUUID) {
        pid = crypto.randomUUID();
        projectIdRef.current = pid;
        setIdeProjectId(pid);
        useIDEStore.getState().setIdeProjectId(pid);
      }

      // Collect registered users for this app to persist into versions
      let appUsers: any[] = [];
      try {
        const rawUsers = localStorage.getItem(`netlify_mock_users:${pid}`) || (pid !== 'default' ? localStorage.getItem('netlify_mock_users:default') : null);
        if (rawUsers) {
          appUsers = JSON.parse(rawUsers);
        }
      } catch {}

      // Fallback: scan all netlify_mock_users:* and netlify_current_user:* in localStorage
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k) continue;
          if (k.startsWith('netlify_mock_users:')) {
            const raw = localStorage.getItem(k);
            const list = raw ? JSON.parse(raw) : [];
            if (Array.isArray(list)) {
              for (const u of list) {
                if (u?.email && u.email !== 'user@askarc.chat' && u.name !== 'App User' && !appUsers.some(ex => ex.email === u.email)) {
                  appUsers.push(u);
                }
              }
            }
          } else if (k.startsWith('netlify_current_user:')) {
            const raw = localStorage.getItem(k);
            const cur = raw ? JSON.parse(raw) : null;
            if (cur?.email && cur.email !== 'user@askarc.chat' && cur.name !== 'App User' && !appUsers.some(ex => ex.email === cur.email)) {
              appUsers.unshift({
                id: cur.id || Math.random().toString(36).substring(2, 9),
                email: cur.email,
                name: cur.name || cur.email.split('@')[0],
                role: cur.role || 'User',
                status: 'Active',
                created_at: cur.created_at ? new Date(cur.created_at).toLocaleDateString() : new Date().toLocaleDateString(),
              });
            }
          }
        }
      } catch {}

      // Collect database records for this app to persist into versions
      const appDb: Record<string, any> = {};
      try {
        const prefixes = [`netlify_db:${pid}:`, 'netlify_db:default:'];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k) continue;
          for (const prefix of prefixes) {
            if (k.startsWith(prefix)) {
              const recordKey = k.slice(prefix.length);
              try {
                const val = JSON.parse(localStorage.getItem(k) || 'null');
                if (appDb[recordKey] === undefined) {
                  appDb[recordKey] = val;
                }
              } catch {
                if (appDb[recordKey] === undefined) {
                  appDb[recordKey] = localStorage.getItem(k);
                }
              }
            }
          }
        }
      } catch {}

      const { data: existingData, error: existingError } = await supabase
        .from('ide_projects')
        .select('*')
        .eq('id', pid)
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (existingError) throw existingError;

      const existingVersions: Record<string, any> = (existingData?.versions && typeof existingData.versions === 'object' && !Array.isArray(existingData.versions))
        ? existingData.versions
        : {};

      const nextVersions = {
        ...existingVersions,
        app_users: appUsers.length > 0 ? appUsers : (existingVersions.app_users || []),
        app_db: Object.keys(appDb).length > 0 ? { ...(existingVersions.app_db || {}), ...appDb } : (existingVersions.app_db || {}),
      };

      if (pid && pid !== 'default') {
        if (nextVersions.app_users?.length) {
          try {
            localStorage.setItem(`netlify_mock_users:${pid}`, JSON.stringify(nextVersions.app_users));
          } catch {}
        }
        if (nextVersions.app_db) {
          for (const [k, v] of Object.entries(nextVersions.app_db)) {
            try {
              localStorage.setItem(`netlify_db:${pid}:${k}`, JSON.stringify(v));
            } catch {}
          }
        }
      }

      scope.signal.throwIfAborted();
      const activeProject = protectedProjectRef.current;
      const isProtected = (existingData as any)?.cloud_managed ||
        (durableAppsEnabled && activeProject?.id === pid);
      let savedResult: { data: { id: string } | null; error: unknown };
      if (isProtected) {
        if (!activeProject || activeProject.id !== pid || activeProject.owner !== session.user.id) {
          throw new Error('This app is protected. Reload it before saving local changes.');
        }
        const saved = await activeProject.client.flush();
        if (saved.status !== 'saved') throw new Error(`App save ${saved.status}; pending edits retained. Do not overwrite newer server files.`);
        scope.signal.throwIfAborted();
        savedResult = await supabase.from('ide_projects').update({
          title: projectTitle, prompt: firstPrompt, versions: nextVersions as any,
        }).eq('id', pid).eq('user_id', session.user.id).select('id').single();
      } else {
        const payload = {
          id: pid,
          user_id: session.user.id,
          title: projectTitle,
          prompt: firstPrompt,
          files: filesToPersist as any,
          messages: messagesToPersist as any,
          versions: nextVersions as any,
          updated_at: new Date().toISOString(),
        };
        // Creation never replaces an independently created row on a UUID collision.
        const query = existingData
          ? supabase.from('ide_projects').update(payload).eq('id', pid).eq('user_id', session.user.id)
          : supabase.from('ide_projects').insert(payload);
        savedResult = await query.select('id').single();
      }
      const { data, error } = savedResult;

      if (error) throw error;
      scope.signal.throwIfAborted();
      if (projectIdRef.current !== pid) return;
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      scope.signal.throwIfAborted();
      if (currentUser?.id !== session.user.id) throw new Error('App owner changed while saving.');

      if (data?.id) {
        projectIdRef.current = data.id;
        setIdeProjectId(data.id);
        useIDEStore.getState().setIdeProjectId(data.id);
      }

      const acknowledged = isProtected ? activeProject?.client.snapshot().saved : null;
      lastSavedSnapshotRef.current = buildPersistenceSnapshot(acknowledged?.files ?? filesToPersist, acknowledged?.messages ?? messagesToPersist, pid);
      setSyncStatus(lastSavedSnapshotRef.current === buildPersistenceSnapshot(filesRef.current, messagesRef.current, pid) ? 'saved' : 'unsaved');
      setProjectSaveError(null);
    } catch (err) {
      if (scope.signal.aborted) return;
      console.error('Failed to save project:', err);
      setSyncStatus('error');
      setProjectSaveError(err instanceof Error ? err.message : 'App save failed; local edits retained.');
    }
  }, [setIdeProjectId]);

  useEffect(() => { syncStatusRef.current = syncStatus; }, [syncStatus]);

  // Listen for real-time events from preview iframe (auth signup, signin, db changes)
  useEffect(() => {
    const handleHostMessage = (event: MessageEvent) => {
      if (!event.data || event.data.source !== 'arc-netlify-db') return;
      const { appId: msgAppId, action, payload } = event.data;
      const currentAppId = msgAppId || projectIdRef.current || ideProjectId || 'default';

      if (action === 'auth-signup' || action === 'auth-signin' || action === 'app-init') {
        const targetAppId = projectIdRef.current || ideProjectId || currentAppId;
        const usersKey = `netlify_mock_users:${targetAppId}`;
        const curUserKey = `netlify_current_user:${targetAppId}`;

        let currentUsers: any[] = [];
        try {
          const raw = localStorage.getItem(usersKey);
          currentUsers = raw ? JSON.parse(raw) : [];
        } catch {}

        if (Array.isArray(payload?.users)) {
          for (const u of payload.users) {
            if (u?.email && u.email !== 'user@askarc.chat' && !currentUsers.some(existing => existing.email === u.email)) {
              currentUsers.unshift(u);
            }
          }
        }
        if (payload?.user && payload.user.email && payload.user.email !== 'user@askarc.chat') {
          try {
            localStorage.setItem(curUserKey, JSON.stringify(payload.user));
          } catch {}
          if (!currentUsers.some(existing => existing.email === payload.user.email)) {
            currentUsers.unshift({
              id: payload.user.id || Math.random().toString(36).substring(2, 9),
              email: payload.user.email,
              name: payload.user.name || payload.user.email.split('@')[0],
              role: payload.user.role || 'User',
              status: 'Active',
              created_at: new Date().toLocaleDateString(),
            });
          }
        }

        try {
          localStorage.setItem(usersKey, JSON.stringify(currentUsers));
          localStorage.setItem(`netlify_mock_users:${currentAppId}`, JSON.stringify(currentUsers));
          if (targetAppId !== currentAppId) {
            localStorage.setItem(`netlify_mock_users:${targetAppId}`, JSON.stringify(currentUsers));
          }
        } catch {}

        window.dispatchEvent(new CustomEvent('netlify-auth-change', {
          detail: { appId: currentAppId, user: payload?.user, users: currentUsers }
        }));
        window.dispatchEvent(new CustomEvent('netlify-auth-change', {
          detail: { appId: targetAppId, user: payload?.user, users: currentUsers }
        }));
        window.dispatchEvent(new Event('storage'));

        // Save immediately to Supabase if we have users
        if (currentUsers.length > 0) {
          void saveProject();
        }
      } else if (action === 'auth-signout') {
        try {
          localStorage.removeItem(`netlify_current_user:${currentAppId}`);
        } catch {}
        window.dispatchEvent(new CustomEvent('netlify-auth-change', {
          detail: { appId: currentAppId, user: null }
        }));
        window.dispatchEvent(new Event('storage'));
      } else if (action === 'db-set') {
        if (payload?.key) {
          try {
            localStorage.setItem(`netlify_db:${currentAppId}:${payload.key}`, JSON.stringify(payload.value));
            if (projectIdRef.current && projectIdRef.current !== currentAppId) {
              localStorage.setItem(`netlify_db:${projectIdRef.current}:${payload.key}`, JSON.stringify(payload.value));
            }
          } catch {}
          window.dispatchEvent(new CustomEvent('netlify-db-change', {
            detail: { appId: currentAppId, key: payload.key, value: payload.value }
          }));
          window.dispatchEvent(new Event('storage'));
          void saveProject();
        }
      } else if (action === 'collection-change') {
        if (payload?.collection) {
          const collKey = `collection:${payload.collection}`;
          try {
            localStorage.setItem(`netlify_db:${currentAppId}:${collKey}`, JSON.stringify(payload.items));
            if (projectIdRef.current && projectIdRef.current !== currentAppId) {
              localStorage.setItem(`netlify_db:${projectIdRef.current}:${collKey}`, JSON.stringify(payload.items));
            }
          } catch {}
          window.dispatchEvent(new CustomEvent(`netlify-collection:${payload.collection}`, { detail: payload.items }));
          window.dispatchEvent(new CustomEvent('netlify-db-change', {
            detail: { appId: currentAppId, key: collKey, value: payload.items }
          }));
          window.dispatchEvent(new Event('storage'));
          void saveProject();
        }
      } else if (action === 'db-delete') {
        if (payload?.key) {
          try {
            localStorage.removeItem(`netlify_db:${currentAppId}:${payload.key}`);
            if (projectIdRef.current && projectIdRef.current !== currentAppId) {
              localStorage.removeItem(`netlify_db:${projectIdRef.current}:${payload.key}`);
            }
          } catch {}
          window.dispatchEvent(new CustomEvent('netlify-db-change', {
            detail: { appId: currentAppId, key: payload.key, deleted: true }
          }));
          window.dispatchEvent(new Event('storage'));
          void saveProject();
        }
      }
    };

    window.addEventListener('message', handleHostMessage);
    return () => window.removeEventListener('message', handleHostMessage);
  }, [saveProject, ideProjectId]);

  // Open project from dashboard
  const handleOpenProject = (p: LovableProject) => {
    const healed = ensureSystemFiles(p.files || DEFAULT_FILES);
    setFiles(healed);
    setMessagesRaw(p.messages || []);
    useIDEStore.getState().setIdeFiles(healed);
    useIDEStore.getState().setIdeMessages(p.messages || []);
    setIdeProjectId(p.id);
    projectIdRef.current = p.id;
    setDeployedUrl(p.netlify_url || null);
    setNetlifySiteId(p.netlify_site_id || null);
    setNetlifySubdomain(p.netlify_subdomain || null);
    setPublishedAppTitle(p.netlify_url ? (p.title || null) : null);

    if (p.versions?.app_users && Array.isArray(p.versions.app_users) && p.versions.app_users.length > 0) {
      const key = `netlify_mock_users:${p.id}`;
      const existing = localStorage.getItem(key);
      if (!existing || existing === '[]') {
        localStorage.setItem(key, JSON.stringify(p.versions.app_users));
        window.dispatchEvent(new CustomEvent('netlify-auth-change', { detail: { appId: p.id, users: p.versions.app_users } }));
      }
    }
  };

  // Delete project from dashboard
  const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this app?')) return;
    
    try {
      const { error } = await supabase
        .from('ide_projects')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setProjects(prev => prev.filter(p => p.id !== id));
      toast({ title: 'App deleted successfully' });
    } catch (e) {
      console.error('Failed to delete project:', e);
      toast({ title: 'Failed to delete app', variant: 'destructive' });
    }
  };

  // Create new app from dashboard
  const handleCreateNewAppSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectPrompt.trim()) return;

    const freshAppId = crypto.randomUUID();
    setFiles(DEFAULT_FILES);
    setMessagesRaw([]);
    useIDEStore.getState().setIdeFiles(DEFAULT_FILES);
    useIDEStore.getState().setIdeMessages([]);
    setIdeProjectId(freshAppId);
    projectIdRef.current = freshAppId;
    setDeployedUrl(null);
    setNetlifySiteId(null);
    setNetlifySubdomain(null);
    setPublishedAppTitle(null);

    const initialPrompt = newProjectPrompt.trim();
    setNewProjectPrompt('');
    if (durableAppsEnabled) {
      didAutoRunInitialPromptRef.current = false;
      useIDEStore.getState().reopenIDECanvas(freshAppId, DEFAULT_FILES, [], initialPrompt);
      return;
    }
    
    setTimeout(() => {
      handleChatSend(initialPrompt);
    }, 100);
  };

  // Chat message sender
  const runAgent = useCallback(async (prompt: string, chatHistory: ChatMessage[] = [], assistantId?: string, images?: string[]) => {
    const cachedBoost = typeof window !== 'undefined' && localStorage.getItem('arcai-has-boost') === 'true';
    const isEntitled = hasBoost || isAdmin || cachedBoost;

    if (!isEntitled && !subscriptionLoading) {
      if (assistantId) {
        setMessages(prev => prev.filter(m => m.id !== assistantId));
      }
      setGeneratingId(null);
      setIsAgentRunning(false);
      setIdeIsRunning(false);
      openCheckout();
      toast({
        title: 'ArcAI Boost Required',
        description: 'App Builder is exclusively available to Boost subscribers and admins.',
      });
      return;
    }

    setIsAgentRunning(true);
    setIdeIsRunning(true);
    setLiveActions([]);
    const aId = assistantId || crypto.randomUUID();

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const model = 'gpt-5.6-luna';

      const historyForAgent = chatHistory
        .filter((m) => (m.content && m.content.trim()) || (m.images && m.images.length > 0))
        .map((m) => ({ role: m.role, content: m.content, images: m.images }));

      const result: AgentResult = await sendAgentMessage(
        prompt,
        filesRef.current,
        (action: AgentAction) => {
          setLiveActions(prev => [...prev, action]);
          setIdeActions(prev => [...prev, action]);
        },
        model,
        session?.access_token,
        historyForAgent,
        (token: string) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === aId
                ? { ...msg, content: (msg.content || '') + token }
                : msg
            )
          );
        },
        (filePath: string, fileContent: string) => {
          if (filePath === 'src/lib/netlifyDb.ts' && (!fileContent.includes('export const netlifyDb =') || !fileContent.includes('export interface AppUser'))) {
            return;
          }
          if (filePath === 'src/components/NetlifyAuthModal.tsx' && !fileContent.includes('export function NetlifyAuthModal')) {
            return;
          }
          setFiles((prev) => ({
            ...prev,
            [filePath]: { content: fileContent, language: filePath.endsWith('.css') ? 'css' : 'typescript' }
          }));
          setSelectedFile(filePath);
        },
        images
      );

      const hasWrittenFiles = !!result.files && Object.keys(result.files).length > 0;
      const hasDeletions = Array.isArray(result.deletions) && result.deletions.length > 0;

      if (hasWrittenFiles || hasDeletions) {
        setFiles((prev) => {
          const merged: VirtualFileSystem = { ...prev };
          for (const [p, f] of Object.entries(result.files || {})) {
            if (p === 'src/lib/netlifyDb.ts' && (!f.content.includes('export const netlifyDb =') || !f.content.includes('export interface AppUser'))) {
              continue;
            }
            if (p === 'src/components/NetlifyAuthModal.tsx' && !f.content.includes('export function NetlifyAuthModal')) {
              continue;
            }
            merged[p] = f;
          }
          for (const path of result.deletions || []) {
            delete merged[path];
          }
          return ensureSystemFiles(merged);
        });

        const firstNew = hasWrittenFiles
          ? Object.keys(result.files!).find(k => k !== 'src/lib/netlifyDb.ts') || Object.keys(result.files!)[0]
          : null;
        if (firstNew) setSelectedFile(firstNew);
      }

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === aId
            ? {
                ...msg,
                content: result.summary || msg.content || (hasWrittenFiles ? 'Successfully applied updates.' : 'Completed request.'),
                agentActions: result.actions,
              }
            : msg
        )
      );
    } catch (err: any) {
      console.error('Agent compilation flow run error:', err);
      toast({ title: 'Error executing agent', description: err.message, variant: 'destructive' });
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === aId
            ? { ...msg, content: `Error: ${err.message || 'Execution failed.'}` }
            : msg
        )
      );
    } finally {
      setIsAgentRunning(false);
      setIdeIsRunning(false);
      setGeneratingId(null);
      void saveProject();
    }
  }, [hasBoost, isAdmin, subscriptionLoading, openCheckout, saveProject, setIdeActions, setIdeIsRunning, setMessages, toast]);

  const handleChatSend = useCallback((message: string, images?: string[]) => {
    if (durableAppsEnabled) {
      if (!cloudReady || !isProjectHydratedRef.current || !appRunsRef.current) {
        setProjectSaveError('Wait for this saved app to finish loading before building.'); return false;
      }
      if (images?.length) { setProjectSaveError('Cloud app builds currently accept text only. Your images were not sent.'); return false; }
      // No local user/assistant transcript append: submit atomically saves the user turn.
      const scope = projectScopeRef.current;
      return appRunsRef.current.start(message, cloudRunMode, { files: filesRef.current, messages: messagesRef.current })
        .then(() => true)
        .catch(error => {
          if (!scope.signal.aborted) setProjectSaveError(error instanceof Error ? error.message : 'Cloud app submission failed.');
          return false;
        });
    }
    if (protectedProjectRef.current) {
      setProjectSaveError('Cloud builds are disabled. The legacy builder cannot modify a protected app.');
      return false;
    }
    autoFixedRef.current = false;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: message, images, timestamp: Date.now() };
    const assistantId = crypto.randomUUID();
    
    setMessages(prev => [...prev, userMsg, { id: assistantId, role: 'assistant', content: '', timestamp: Date.now() }]);
    setGeneratingId(assistantId);
    runAgent(message, messagesRef.current, assistantId, images);
  }, [runAgent, setMessages, cloudReady, cloudRunMode]);

  // Auto-run initial prompt on mount once subscription verification completes
  useEffect(() => {
    if (subscriptionLoading) return;
    if (durableAppsEnabled && (!cloudReady || !projectLoaded)) return;
    if (idePrompt && ideAutoRunPrompt && !didAutoRunInitialPromptRef.current) {
      didAutoRunInitialPromptRef.current = true;
      const promptToRun = idePrompt;
      clearIdePrompt();
      handleChatSend(promptToRun);
    }
  }, [idePrompt, ideAutoRunPrompt, subscriptionLoading, handleChatSend, clearIdePrompt, cloudReady, projectLoaded]);

  // Track compilation/runtime errors in preview without triggering recursive loops
  const handlePreviewError = useCallback((error: string) => {
    lastErrorRef.current = error;
  }, []);

  const handleFileChange = (path: string, content: string) => {
    localEditEpochRef.current++;
    setFiles(prev => ({ ...prev, [path]: { ...prev[path], content } }));
  };

  const handleAddFile = (path: string) => {
    localEditEpochRef.current++;
    setFiles(prev => ({ ...prev, [path]: { content: '', language: 'typescript' } }));
  };

  const handleDeleteFile = (path: string) => {
    localEditEpochRef.current++;
    setFiles(prev => {
      const next = { ...prev };
      delete next[path];
      return next;
    });
  };

  const handleToggleHideBadge = async (nextHide: boolean) => {
    setHideBadge(nextHide);
    const pid = projectIdRef.current || ideProjectId;
    if (!pid) return;

    try {
      const { data: proj } = await supabase
        .from('ide_projects')
        .select('versions')
        .eq('id', pid)
        .maybeSingle();
      const currentVersions = (proj?.versions && typeof proj.versions === 'object') ? proj.versions : {};
      const updatedVersions = { ...currentVersions, hide_badge: nextHide };
      await supabase
        .from('ide_projects')
        .update({ versions: updatedVersions })
        .eq('id', pid);
      toast({
        title: nextHide ? 'ArcAi badge disabled' : 'ArcAi badge enabled',
        description: deployedUrl
          ? 'Update or re-deploy your app to sync changes to the live site.'
          : 'Setting saved for this app.',
      });
    } catch (e) {
      console.error('Failed to update badge setting:', e);
    }
  };

  // Netlify Publishing
  const handleDeploy = async (
    subdomain: string,
    siteTitle: string,
    faviconSvg: string,
    favLabel?: string,
    seoDesc?: string,
    shouldHideBadge?: boolean
  ) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Unauthorized');
    if (!projectIdRef.current) throw new Error('Create and save a project first before deploying.');

    const result = await deployToNetlify(
      projectIdRef.current,
      files,
      subdomain,
      netlifySiteId || undefined,
      siteTitle,
      faviconSvg,
      seoDesc,
      shouldHideBadge
    );

    setDeployedUrl(result.url);
    setNetlifySiteId(result.siteId);
    setNetlifySubdomain(result.subdomain);
    setPublishedAppTitle(siteTitle);
    if (seoDesc !== undefined) setSeoDescription(seoDesc);
    if (favLabel) setFaviconLabel(favLabel);
    if (shouldHideBadge !== undefined) setHideBadge(shouldHideBadge);

    let currentVersions: any = {};
    try {
      const { data: proj } = await supabase
        .from('ide_projects')
        .select('versions')
        .eq('id', projectIdRef.current)
        .maybeSingle();
      if (proj?.versions && typeof proj.versions === 'object') {
        currentVersions = proj.versions;
      }
    } catch {}

    const updatedVersions = {
      ...currentVersions,
      seo_description: seoDesc || '',
      hide_badge: !!shouldHideBadge,
    };

    await supabase
      .from('ide_projects')
      .update({
        title: siteTitle,
        favicon_label: favLabel || null,
        netlify_url: result.url,
        netlify_site_id: result.siteId,
        netlify_subdomain: result.subdomain,
        versions: updatedVersions,
      })
      .eq('id', projectIdRef.current);

    toast({ title: 'App published successfully!' });
  };

  const handleUnpublish = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Unauthorized');
    if (!netlifySiteId) return;

    await unpublishFromNetlify(netlifySiteId, session.access_token);

    setDeployedUrl(null);
    setNetlifySiteId(null);
    setNetlifySubdomain(null);
    setPublishedAppTitle(null);

    if (projectIdRef.current) {
      await supabase
        .from('ide_projects')
        .update({
          netlify_url: null,
          netlify_site_id: null,
          netlify_subdomain: null,
        })
        .eq('id', projectIdRef.current);
    }

    toast({ title: 'App unpublished successfully' });
  };

  const handleCopyAll = async () => {
    const allCode = Object.entries(files)
      .map(([path, file]) => `// === ${path} ===\n${file.content}`)
      .join('\n\n');
    await navigator.clipboard.writeText(allCode);
    setCopied(true);
    toast({ title: 'All files copied' });
    setTimeout(() => setCopied(false), 2000);
  };

  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const projectName = messages.find(m => m.role === 'user')?.content?.slice(0, 40) || 'arc-app';
      const { filename } = await exportProjectAsZip(projectName, files);
      toast({ 
        title: 'Codebase Exported (ZIP)',
        description: `Downloaded ${filename} ready for Git repository initialization.`,
      });
    } catch (err: any) {
      toast({
        title: 'Export failed',
        description: err?.message || 'Could not package codebase.',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleGoHome = () => {
    setIdeProjectId(null);
    projectIdRef.current = null;
    setDeployedUrl(null);
    setNetlifySiteId(null);
    setNetlifySubdomain(null);
    setPublishedAppTitle(null);
    if (onClose) onClose();
  };

  // Render Workspace
  return (
    <div
      className={cn("dark arc-ide-workspace h-[100dvh] max-h-[100dvh] w-screen max-w-full flex flex-col bg-[#08090c] text-foreground select-none overflow-hidden", className)}
      style={{ colorScheme: 'dark' }}
    >
      {projectSaveError && (
        <div role="alert" className="shrink-0 flex items-center gap-3 px-4 py-2 text-sm bg-amber-950 text-amber-100">
          <span className="flex-1">{projectSaveError}</span>
          <button onClick={() => void saveProject()} className="underline">Retry save</button>
          <button onClick={() => setProjectReloadVersion(value => value + 1)} className="underline">Reload safely</button>
        </div>
      )}
      {durableAppsEnabled && (
        <section aria-label="Cloud app build" className="shrink-0 border-b border-white/10 px-4 py-2 text-xs space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <label>Build mode <select aria-label="App build mode" value={cloudRunMode} disabled={cloudActive}
              onChange={event => setCloudRunMode(event.target.value as 'ask' | 'auto')} className="bg-background border rounded px-2 py-1 ml-1">
              <option value="ask">Ask before file changes</option><option value="auto">Auto apply file changes</option>
            </select></label>
            <span role="status">{cloudRunView.entry?.run?.status ?? (cloudReady ? 'Ready' : 'Connecting…')}{cloudRunView.entry?.connection === 'uncertain' ? ' — submission uncertain; reconnect, do not resend' : ''}</span>
            <button className="underline" onClick={() => {
              const coordinator = appRunsRef.current;
              void coordinator?.reconnect().then(() => { if (appRunsRef.current === coordinator) setCloudReady(true); })
                .catch(error => { if (appRunsRef.current === coordinator) setProjectSaveError(String(error)); });
            }}>Reconnect</button>
            {cloudActive && <button className="underline" onClick={() => void appRunsRef.current?.cancel().catch(error => setProjectSaveError(String(error)))}>Cancel run</button>}
            {cloudRunView.nextCursor && <button className="underline" onClick={() => void appRunsRef.current?.restore(cloudRunView.nextCursor!).catch(error => setProjectSaveError(String(error)))}>Find older builds</button>}
            <span className="text-muted-foreground">Closing the IDE does not cancel a cloud build.</span>
          </div>
          {cloudRunView.error && <p role="alert">{cloudRunView.error}</p>}
          {cloudRunView.entry?.run?.error != null && <p role="alert">{typeof cloudRunView.entry.run.error === 'string' ? cloudRunView.entry.run.error : JSON.stringify(cloudRunView.entry.run.error)}</p>}
          {cloudRunView.entry?.run?.checkpoint?.pendingApproval && (
            <div className="space-y-2">
              <p>Review this exact change before approving:</p>
              <pre className="max-h-36 overflow-auto whitespace-pre-wrap select-text">{cloudRunView.entry.run.checkpoint.pendingApproval.name}{'\n'}{cloudRunView.entry.run.checkpoint.pendingApproval.arguments}</pre>
              <button disabled={cloudRunView.busy} className="underline mr-4" onClick={() => void appRunsRef.current?.decide('approve').catch(error => setProjectSaveError(String(error)))}>Approve change</button>
              <button disabled={cloudRunView.busy} className="underline" onClick={() => void appRunsRef.current?.decide('deny').catch(error => setProjectSaveError(String(error)))}>Deny change</button>
            </div>
          )}
        </section>
      )}
      {/* Mac Traffic Light Spacer (Mac App & Web App) */}
      {reserveTrafficLightSpace && (
        <div
          className="w-full shrink-0 select-none pointer-events-none"
          style={{
            height: 'calc(env(safe-area-inset-top, 0px) + var(--arcai-desktop-titlebar-safe-area, 30px))',
            WebkitAppRegion: 'drag',
          } as React.CSSProperties}
        />
      )}

      {/* Floating Glass Studio Header Dock */}
      {isMobile ? (
        <header className="px-3 pb-2.5 bg-[#0f1117]/95 border-b border-white/10 backdrop-blur-2xl flex items-center justify-between shrink-0 z-30 pt-[max(56px,calc(env(safe-area-inset-top,0px)+12px))]">
          {/* Left: Project identity & Back */}
          <div className="flex items-center gap-2 min-w-0">
            <Button 
              size="icon" 
              variant="ghost" 
              onClick={handleGoHome}
              className="h-8 w-8 rounded-xl hover:bg-white/10 text-muted-foreground hover:text-foreground shrink-0"
              title="Dashboard"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>

            <div className="w-6 h-6 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center p-1 shrink-0">
              <ThemedLogo className="w-full h-full object-contain" />
            </div>

            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs font-semibold truncate text-foreground max-w-[130px]">
                {publishedAppTitle || messages.find(m => m.role === 'user')?.content?.slice(0, 45) || 'Arc Web App'}
              </span>
              <span className="text-[8px] font-mono font-bold bg-primary/15 text-primary border border-primary/25 px-1 py-0.2 rounded uppercase tracking-wider select-none shrink-0">
                LUNA
              </span>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="sm"
              onClick={() => setShowPublishDialog(true)}
              className="h-7 px-2 rounded-lg bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-medium text-[11px] gap-1 shadow-sm hover:opacity-95"
            >
              <Rocket className="h-3 w-3" />
              <span>{deployedUrl ? 'Update' : 'Deploy'}</span>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5"
                  title="More options"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="dark arc-ide-workspace w-56 bg-[#0f1117]/95 border-white/10 backdrop-blur-xl rounded-xl p-1.5 shadow-2xl" style={{ colorScheme: 'dark' }}>
                <DropdownMenuItem 
                  onClick={handleExport}
                  disabled={isExporting}
                  className="flex items-center gap-2 text-xs py-2 px-2.5 rounded-lg cursor-pointer focus:bg-white/10"
                >
                  {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" /> : <FolderArchive className="w-3.5 h-3.5 text-primary shrink-0" />}
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">Download Codebase</span>
                    <span className="text-[10px] text-muted-foreground">Vite + React ZIP</span>
                  </div>
                </DropdownMenuItem>

                <DropdownMenuItem 
                  onClick={handleCopyAll}
                  className="flex items-center gap-2 text-xs py-2 px-2.5 rounded-lg cursor-pointer focus:bg-white/10"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-primary shrink-0" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                  <span className="font-medium text-foreground">Copy All Code</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator className="bg-white/10 my-1" />

                <DropdownMenuItem 
                  onClick={() => {
                    toast({
                      title: "GitHub Sync Coming Soon",
                      description: "Direct 1-click push to GitHub repositories will be supported in an upcoming Arc release. For now, download the ZIP and run git init.",
                    });
                  }}
                  className="flex items-center justify-between text-xs py-2 px-2.5 rounded-lg cursor-pointer focus:bg-white/10 opacity-80"
                >
                  <div className="flex items-center gap-2">
                    <GitBranch className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    <span className="font-medium text-foreground">Push to GitHub</span>
                  </div>
                  <span className="text-[8px] font-mono uppercase bg-purple-500/15 text-purple-400 border border-purple-500/25 px-1 py-0.5 rounded">Soon</span>
                </DropdownMenuItem>

                <DropdownMenuSeparator className="bg-white/10 my-1" />

                <DropdownMenuItem 
                  onClick={closeIDE}
                  className="flex items-center gap-2 text-xs py-2 px-2.5 rounded-lg cursor-pointer text-destructive focus:bg-destructive/10"
                >
                  <X className="w-3.5 h-3.5" />
                  <span className="font-medium">Close Studio</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button 
              variant="ghost" 
              size="icon" 
              onClick={closeIDE} 
              className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5"
              title="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>
      ) : (
        <header className={cn(
          "px-4 py-2.5 mx-3 mb-1.5 rounded-2xl bg-[#0f1117]/85 border border-white/10 backdrop-blur-2xl flex items-center justify-between shrink-0 shadow-[0_8px_32px_rgba(0,0,0,0.4)]",
          reserveTrafficLightSpace ? "mt-1" : "mt-2.5"
        )}>
          {/* Left: Project identity & Back */}
          <div className="flex items-center gap-3">
            <Button 
              size="sm" 
              variant="ghost" 
              onClick={handleGoHome}
              className="h-8 px-2.5 rounded-xl hover:bg-white/10 gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-all"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Dashboard</span>
            </Button>

            <div className="h-4 w-[1px] bg-white/10 shrink-0" />

            {/* Project Title with Themed Logo */}
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center p-1 shrink-0">
                <ThemedLogo className="w-full h-full object-contain" />
              </div>
              <span className="text-xs font-semibold max-w-[180px] sm:max-w-[240px] truncate text-foreground">
                {publishedAppTitle || messages.find(m => m.role === 'user')?.content?.slice(0, 45) || 'Arc Web App'}
              </span>
              <span className="text-[9px] font-mono font-bold bg-primary/15 text-primary border border-primary/25 px-1.5 py-0.2 rounded-md uppercase tracking-wider select-none">
                LUNA
              </span>
            </div>
          </div>

          {/* Center: Segmented View Mode Tabs */}
          <div className="flex items-center bg-[#14161f] border border-white/5 rounded-xl p-1 shadow-inner">
            <button
              onClick={() => setActiveTab('preview')}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 text-xs rounded-lg font-medium transition-all",
                activeTab === 'preview' 
                  ? "bg-white/10 text-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Eye className="h-3.5 w-3.5" />
              <span>Preview</span>
            </button>
            <button
              onClick={() => setActiveTab('code')}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 text-xs rounded-lg font-medium transition-all",
                activeTab === 'code' 
                  ? "bg-white/10 text-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Code2 className="h-3.5 w-3.5" />
              <span>Code Editor</span>
            </button>
            <button
              onClick={() => setActiveTab('cloud')}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 text-xs rounded-lg font-medium transition-all",
                activeTab === 'cloud' 
                  ? "bg-white/10 text-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Cloud className="h-3.5 w-3.5" />
              <span>Database & Cloud</span>
            </button>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {/* Netlify Publish with askarc.chat domain */}
            <Button
              size="sm"
              onClick={() => setShowPublishDialog(true)}
              className="h-8 px-3 rounded-xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground font-medium text-xs gap-1.5 shadow-md hover:opacity-95 transition-all"
            >
              <Rocket className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{deployedUrl ? 'Update App' : 'Deploy Live'}</span>
            </Button>

            {/* Export Codebase / Git Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  disabled={isExporting}
                  className="h-8 px-2.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all gap-1.5 text-xs"
                  title="Export codebase"
                >
                  {isExporting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span className="hidden md:inline">Export</span>
                  <ChevronDown className="w-3 h-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="dark arc-ide-workspace w-60 bg-[#0f1117]/95 border-white/10 backdrop-blur-xl rounded-xl p-1.5 shadow-2xl" style={{ colorScheme: 'dark' }}>
                <DropdownMenuItem 
                  onClick={handleExport}
                  className="flex items-center gap-2.5 text-xs py-2 px-2.5 rounded-lg cursor-pointer focus:bg-white/10"
                >
                  <FolderArchive className="w-4 h-4 text-primary shrink-0" />
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">Download Codebase</span>
                    <span className="text-[10px] text-muted-foreground">Vite + React ZIP ready for Git</span>
                  </div>
                </DropdownMenuItem>

                <DropdownMenuItem 
                  onClick={handleCopyAll}
                  className="flex items-center gap-2.5 text-xs py-2 px-2.5 rounded-lg cursor-pointer focus:bg-white/10"
                >
                  {copied ? <Check className="w-4 h-4 text-primary shrink-0" /> : <Copy className="w-4 h-4 text-muted-foreground shrink-0" />}
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">Copy All Code</span>
                    <span className="text-[10px] text-muted-foreground">Copy all files to clipboard</span>
                  </div>
                </DropdownMenuItem>

                <DropdownMenuSeparator className="bg-white/10 my-1" />

                <DropdownMenuItem 
                  onClick={() => {
                    toast({
                      title: "GitHub Sync Coming Soon",
                      description: "Direct 1-click push to GitHub repositories will be supported in an upcoming Arc release. For now, download the ZIP and run git init.",
                    });
                  }}
                  className="flex items-center justify-between text-xs py-2 px-2.5 rounded-lg cursor-pointer focus:bg-white/10 opacity-80"
                >
                  <div className="flex items-center gap-2.5">
                    <GitBranch className="w-4 h-4 text-purple-400 shrink-0" />
                    <span className="font-medium text-foreground">Push to GitHub</span>
                  </div>
                  <span className="text-[9px] font-mono uppercase bg-purple-500/15 text-purple-400 border border-purple-500/25 px-1.5 py-0.5 rounded">Soon</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button 
              variant="ghost" 
              size="sm" 
              onClick={closeIDE} 
              className="text-xs h-8 px-3 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
            >
              Close
            </Button>
          </div>
        </header>
      )}

      {/* Boost Entitlement Banner */}
      {!hasBoost && !isAdmin && (
        <div className="mx-3 mb-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-500/10 via-primary/10 to-purple-500/10 border border-purple-500/20 flex items-center justify-between shrink-0 text-xs">
          <div className="flex items-center gap-2 text-purple-300">
            <Sparkles className="h-3.5 w-3.5 text-purple-400 shrink-0" />
            <span>ArcAI Boost is required to generate, edit, and publish web applications.</span>
          </div>
          <Button
            size="sm"
            onClick={() => openCheckout()}
            className="h-6 px-2.5 text-[11px] rounded-lg bg-purple-500 hover:bg-purple-600 text-white shadow-sm"
          >
            Upgrade to Boost
          </Button>
        </div>
      )}

      {/* Workspace Panel Area */}
      {isMobile ? (
        <>
          {/* Mobile Workspace Panels - All kept mounted to preserve live sandbox iframe state */}
          <div className="flex-1 min-h-0 overflow-hidden relative m-0 rounded-none border-0 bg-[#08090c]">
            <div className={cn("absolute inset-0", activeTab === 'chat' ? "block" : "hidden pointer-events-none")}>
              <IDEChatPanel
                messages={messages}
                liveActions={liveActions}
                isLoading={isAgentRunning || cloudActive}
                generatingId={generatingId}
                onSend={handleChatSend}
                onSelectFile={(path) => {
                  setSelectedFile(path);
                  setActiveTab('code');
                }}
                syncStatus={syncStatus}
                onViewPreview={() => setActiveTab('preview')}
              />
            </div>
            <div className={cn("absolute inset-0", activeTab === 'preview' ? "block" : "hidden pointer-events-none")}>
              <IDEPreviewPanel 
                files={files} 
                onError={handlePreviewError} 
                deployedUrl={deployedUrl}
                onPublishClick={() => setShowPublishDialog(true)}
                projectId={projectIdRef.current || ideProjectId}
                isBuilding={isAgentRunning}
              />
            </div>
            <div className={cn("absolute inset-0", activeTab === 'code' ? "block" : "hidden pointer-events-none")}>
              <IDECodeEditor 
                files={files} 
                selectedFile={selectedFile} 
                setSelectedFile={setSelectedFile} 
                onFileChange={handleFileChange}
                onAddFile={handleAddFile}
                onDeleteFile={handleDeleteFile}
              />
            </div>
            <div className={cn("absolute inset-0 overflow-y-auto bg-[#0b0c10]", activeTab === 'cloud' ? "block" : "hidden pointer-events-none")}>
              <IDECloudPanel 
                files={files} 
                setFiles={setFiles} 
                onChatSend={handleChatSend}
                isAgentRunning={isAgentRunning}
                projectId={projectIdRef.current || ideProjectId}
                hideBadge={hideBadge}
                onToggleHideBadge={handleToggleHideBadge}
                onDeployClick={() => setShowPublishDialog(true)}
                isDeployed={!!deployedUrl}
              />
            </div>
          </div>

          {/* Floating Glass Mobile Bottom Navigation Dock */}
          <nav className="shrink-0 z-40 bg-[#0c0d12]/95 backdrop-blur-2xl border-t border-white/10 px-3 pt-2 pb-[max(20px,calc(env(safe-area-inset-bottom,0px)+14px))] flex items-center justify-around shadow-[0_-8px_32px_rgba(0,0,0,0.6)]">
            <button
              type="button"
              onClick={() => setActiveTab('chat')}
              className={cn(
                "flex flex-col items-center justify-center gap-1 py-1 px-3 rounded-xl transition-all relative",
                activeTab === 'chat' ? "text-primary font-semibold" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div className="relative">
                <MessageSquare className="h-5 w-5" />
                {isAgentRunning && (
                  <span className="absolute -top-1 -right-1.5 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-purple-500" />
                  </span>
                )}
              </div>
              <span className="text-[10px] tracking-tight">Chat</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              className={cn(
                "flex flex-col items-center justify-center gap-1 py-1 px-3 rounded-xl transition-all relative",
                activeTab === 'preview' ? "text-primary font-semibold" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Eye className="h-5 w-5" />
              <span className="text-[10px] tracking-tight">Preview</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('code')}
              className={cn(
                "flex flex-col items-center justify-center gap-1 py-1 px-3 rounded-xl transition-all relative",
                activeTab === 'code' ? "text-primary font-semibold" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Code2 className="h-5 w-5" />
              <span className="text-[10px] tracking-tight">Code</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('cloud')}
              className={cn(
                "flex flex-col items-center justify-center gap-1 py-1 px-3 rounded-xl transition-all relative",
                activeTab === 'cloud' ? "text-primary font-semibold" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Cloud className="h-5 w-5" />
              <span className="text-[10px] tracking-tight">Cloud</span>
            </button>
          </nav>
        </>
      ) : (
        <div className="flex-1 min-h-0 overflow-hidden relative mx-3 mb-2 rounded-2xl border border-white/5 bg-[#0b0c10] shadow-2xl">
          <ResizablePanelGroup direction="horizontal" className="h-full min-h-0">
            {/* Left AI Sidecar Chat */}
            <ResizablePanel defaultSize={32} minSize={22} maxSize={45} className="min-w-[280px] h-full min-h-0">
              <IDEChatPanel
                messages={messages}
                liveActions={liveActions}
                isLoading={isAgentRunning || cloudActive}
                generatingId={generatingId}
                onSend={handleChatSend}
                onSelectFile={(path) => {
                  setSelectedFile(path);
                  setActiveTab('code');
                }}
                syncStatus={syncStatus}
                onViewPreview={() => setActiveTab('preview')}
              />
            </ResizablePanel>

            <ResizableHandle className="w-1 bg-white/5 hover:bg-primary/30 transition-colors cursor-col-resize" />

            {/* Right Main Stage: Preview, Code, or Cloud */}
            <ResizablePanel defaultSize={68} className="h-full min-h-0">
              <div className="h-full min-h-0 flex flex-col overflow-hidden relative">
                <div className={cn("h-full w-full min-h-0", activeTab === 'preview' ? "flex flex-col" : "hidden")}>
                  <IDEPreviewPanel 
                    files={files} 
                    onError={handlePreviewError} 
                    deployedUrl={deployedUrl}
                    onPublishClick={() => setShowPublishDialog(true)}
                    projectId={projectIdRef.current || ideProjectId}
                    isBuilding={isAgentRunning}
                  />
                </div>
                <div className={cn("h-full w-full min-h-0", activeTab === 'code' ? "flex flex-col" : "hidden")}>
                  <IDECodeEditor 
                    files={files} 
                    selectedFile={selectedFile} 
                    setSelectedFile={setSelectedFile} 
                    onFileChange={handleFileChange}
                    onAddFile={handleAddFile}
                    onDeleteFile={handleDeleteFile}
                  />
                </div>
                <div className={cn("h-full w-full min-h-0 overflow-y-auto bg-[#0b0c10]", activeTab === 'cloud' ? "block" : "hidden")}>
                  <IDECloudPanel 
                    files={files} 
                    setFiles={setFiles} 
                    onChatSend={handleChatSend}
                    isAgentRunning={isAgentRunning}
                    projectId={projectIdRef.current || ideProjectId}
                    hideBadge={hideBadge}
                    onToggleHideBadge={handleToggleHideBadge}
                    onDeployClick={() => setShowPublishDialog(true)}
                    isDeployed={!!deployedUrl}
                  />
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      )}

      <PublishDialog
        open={showPublishDialog}
        onOpenChange={setShowPublishDialog}
        currentAppTitle={publishedAppTitle}
        currentSubdomain={netlifySubdomain}
        deployedUrl={deployedUrl}
        siteId={netlifySiteId}
        prompt={messages.find(m => m.role === 'user')?.content || ''}
        files={files}
        initialFaviconLabel={faviconLabel}
        initialSeoDescription={seoDescription}
        initialHideBadge={hideBadge}
        onPublish={handleDeploy}
        onUnpublish={handleUnpublish}
      />

      {/* Background sync worker: loads published site to recover accounts/database from its origin */}
      {deployedUrl && (
        <iframe
          src={deployedUrl}
          title="arc-deployed-sync-worker"
          aria-hidden="true"
          tabIndex={-1}
          className="hidden w-0 h-0 border-0 pointer-events-none opacity-0 fixed -bottom-96"
          style={{ display: 'none' }}
        />
      )}
    </div>
  );
}
