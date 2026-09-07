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
}

const buildPersistenceSnapshot = (nextFiles: VirtualFileSystem, nextMessages: ChatMessage[], nextProjectId?: string | null) =>
  JSON.stringify({ projectId: nextProjectId, files: nextFiles, messages: nextMessages });

export function ensureSystemFiles(vfs: VirtualFileSystem): VirtualFileSystem {
  let changed = false;
  const next = { ...vfs };

  const dbFile = next['src/lib/netlifyDb.ts'];
  if (!dbFile?.content || !dbFile.content.includes('export const netlifyDb =') || !dbFile.content.includes('export interface AppUser')) {
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

export function IDECanvasPanel({ className, onClose }: IDECanvasPanelProps) {
  const idePrompt = useIDEStore((s) => s.idePrompt);
  const ideAutoRunPrompt = useIDEStore((s) => s.ideAutoRunPrompt);
  const ideProjectId = useIDEStore((s) => s.ideProjectId);
  const closeIDE = useIDEStore((s) => s.closeIDE);
  const setIdeIsRunning = useIDEStore((s) => s.setIdeIsRunning);
  const setIdeActions = useIDEStore((s) => s.setIdeActions);
  const clearIdePrompt = useIDEStore((s) => s.clearIdePrompt);
  const setIdeProjectId = useIDEStore((s) => s.setIdeProjectId);

  const { hasBoost, isAdmin, openCheckout } = useSubscription();

  const [files, setFiles] = useState<VirtualFileSystem>(() => {
    const storeFiles = useIDEStore.getState().ideFiles;
    const initial = storeFiles && Object.keys(storeFiles).length > 0 ? storeFiles : DEFAULT_FILES;
    return ensureSystemFiles(initial);
  });
  const [selectedFile, setSelectedFile] = useState<string | null>('src/App.tsx');
  const [activeTab, setActiveTab] = useState<'chat' | 'preview' | 'code' | 'cloud'>('preview');
  const [copied, setCopied] = useState(false);

  // Default to chat tab on mobile, preview on desktop
  useEffect(() => {
    if (isMobile) {
      setActiveTab('chat');
    } else if (activeTab === 'chat') {
      setActiveTab('preview');
    }
  }, [isMobile, activeTab]);
  
  const [messages, setMessagesRaw] = useState<ChatMessage[]>(() => {
    const storeMsgs = useIDEStore.getState().ideMessages;
    return storeMsgs?.length ? (storeMsgs as ChatMessage[]) : [];
  });
  const setMessages: typeof setMessagesRaw = useCallback((update) => {
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
  
  const [projects, setProjects] = useState<LovableProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [newProjectPrompt, setNewProjectPrompt] = useState('');

  const isMobile = useIsMobile();
  const { toast } = useToast();
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
    if (!ideProjectId) return;

    supabase
      .from('ide_projects')
      .select('title, netlify_url, netlify_site_id, netlify_subdomain, messages, versions')
      .eq('id', ideProjectId)
      .single()
      .then(({ data }) => {
        if (!data) return;

        setDeployedUrl((data as any).netlify_url || null);
        setNetlifySiteId((data as any).netlify_site_id || null);
        setNetlifySubdomain((data as any).netlify_subdomain || null);
        if ((data as any).netlify_url && (data as any).title) {
          setPublishedAppTitle((data as any).title);
        } else if (!(data as any).netlify_url) {
          setPublishedAppTitle(null);
        }

        const appUsers = (data as any)?.versions?.app_users;
        if (Array.isArray(appUsers) && appUsers.length > 0) {
          const key = `netlify_mock_users:${ideProjectId}`;
          const existing = localStorage.getItem(key);
          if (!existing || existing === '[]') {
            localStorage.setItem(key, JSON.stringify(appUsers));
            window.dispatchEvent(new CustomEvent('netlify-auth-change', { detail: { appId: ideProjectId, users: appUsers } }));
          }
        }

        const dbMessages = (data as any).messages;
        if (Array.isArray(dbMessages) && dbMessages.length > 0 && messagesRef.current.length === 0) {
          setMessagesRaw(dbMessages as ChatMessage[]);
          useIDEStore.getState().setIdeMessages(dbMessages as ChatMessage[]);
          messagesRef.current = dbMessages as ChatMessage[];
          lastSavedSnapshotRef.current = buildPersistenceSnapshot(filesRef.current, dbMessages as ChatMessage[], ideProjectId);
        }
      });
  }, [ideProjectId]);

  // Auto-saving snapshot listener
  useEffect(() => {
    const currentSnapshot = buildPersistenceSnapshot(files, messages, projectIdRef.current || ideProjectId);

    if (!ideProjectId) {
      localStorage.setItem('arc_ide_local_snapshot', currentSnapshot);
    }

    if (currentSnapshot !== lastSavedSnapshotRef.current) {
      setSyncStatus('unsaved');

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
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const filesToPersist = filesRef.current;
      const messagesToPersist = messagesRef.current;

      setSyncStatus('saving');

      const firstPrompt = messagesToPersist.find((m) => m.role === 'user')?.content || 'Arc App';
      const projectTitle = firstPrompt ? firstPrompt.slice(0, 100) : 'Untitled Project';

      // Ensure valid UUID for ide_projects
      let pid = projectIdRef.current;
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
          if (pid !== 'default') {
            localStorage.setItem(`netlify_mock_users:${pid}`, rawUsers);
          }
        }
      } catch {}

      const { data: existingData } = await supabase
        .from('ide_projects')
        .select('versions')
        .eq('id', pid)
        .maybeSingle();

      const existingVersions = (existingData?.versions && typeof existingData.versions === 'object' && !Array.isArray(existingData.versions))
        ? existingData.versions
        : {};

      const nextVersions = {
        ...existingVersions,
        app_users: appUsers.length > 0 ? appUsers : (existingVersions.app_users || []),
      };

      const { data, error } = await supabase
        .from('ide_projects')
        .upsert({
          id: pid,
          user_id: session.user.id,
          title: projectTitle,
          prompt: firstPrompt,
          files: filesToPersist as any,
          messages: messagesToPersist as any,
          versions: nextVersions as any,
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (error) throw error;

      if (data?.id) {
        projectIdRef.current = data.id;
        setIdeProjectId(data.id);
        useIDEStore.getState().setIdeProjectId(data.id);
      }

      lastSavedSnapshotRef.current = buildPersistenceSnapshot(filesToPersist, messagesToPersist, pid);
      setSyncStatus('saved');
    } catch (err) {
      console.error('Failed to save project:', err);
      setSyncStatus('error');
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
        const usersKey = `netlify_mock_users:${currentAppId}`;
        const curUserKey = `netlify_current_user:${currentAppId}`;

        let currentUsers: any[] = [];
        try {
          const raw = localStorage.getItem(usersKey);
          currentUsers = raw ? JSON.parse(raw) : [];
        } catch {}

        if (Array.isArray(payload?.users)) {
          for (const u of payload.users) {
            if (u?.email && !currentUsers.some(existing => existing.email === u.email)) {
              currentUsers.unshift(u);
            }
          }
        }
        if (payload?.user) {
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
          if (projectIdRef.current && projectIdRef.current !== currentAppId) {
            localStorage.setItem(`netlify_mock_users:${projectIdRef.current}`, JSON.stringify(currentUsers));
          }
        } catch {}

        window.dispatchEvent(new CustomEvent('netlify-auth-change', {
          detail: { appId: currentAppId, user: payload?.user, users: currentUsers }
        }));
        window.dispatchEvent(new Event('storage'));

        // Save immediately to Supabase
        void saveProject();
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
          } catch {}
          window.dispatchEvent(new CustomEvent('netlify-db-change', {
            detail: { appId: currentAppId, key: payload.key, value: payload.value }
          }));
          window.dispatchEvent(new Event('storage'));
        }
      } else if (action === 'db-delete') {
        if (payload?.key) {
          try {
            localStorage.removeItem(`netlify_db:${currentAppId}:${payload.key}`);
          } catch {}
          window.dispatchEvent(new CustomEvent('netlify-db-change', {
            detail: { appId: currentAppId, key: payload.key, deleted: true }
          }));
          window.dispatchEvent(new Event('storage'));
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
    setIdeFiles(healed);
    setIdeMessages(p.messages || []);
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
    setIdeFiles(DEFAULT_FILES);
    setIdeMessages([]);
    setIdeProjectId(freshAppId);
    projectIdRef.current = freshAppId;
    setDeployedUrl(null);
    setNetlifySiteId(null);
    setNetlifySubdomain(null);
    setPublishedAppTitle(null);

    const initialPrompt = newProjectPrompt.trim();
    setNewProjectPrompt('');
    
    setTimeout(() => {
      handleChatSend(initialPrompt);
    }, 100);
  };

  // Chat message sender
  const runAgent = useCallback(async (prompt: string, chatHistory: ChatMessage[] = [], assistantId?: string, images?: string[]) => {
    if (!hasBoost && !isAdmin) {
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
  }, [hasBoost, isAdmin, openCheckout, saveProject, setIdeActions, setIdeIsRunning, setMessages, toast]);

  const handleChatSend = useCallback((message: string, images?: string[]) => {
    autoFixedRef.current = false;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: message, images, timestamp: Date.now() };
    const assistantId = crypto.randomUUID();
    
    setMessages(prev => [...prev, userMsg, { id: assistantId, role: 'assistant', content: '', timestamp: Date.now() }]);
    setGeneratingId(assistantId);
    runAgent(message, messagesRef.current, assistantId, images);
  }, [runAgent, setMessages]);

  // Auto-run initial prompt on mount if supplied
  useEffect(() => {
    if (idePrompt && ideAutoRunPrompt && !didAutoRunInitialPromptRef.current) {
      didAutoRunInitialPromptRef.current = true;
      clearIdePrompt();
      handleChatSend(idePrompt);
    }
  }, [idePrompt, ideAutoRunPrompt, handleChatSend, clearIdePrompt]);

  // Track compilation/runtime errors in preview without triggering recursive loops
  const handlePreviewError = useCallback((error: string) => {
    lastErrorRef.current = error;
  }, []);

  const handleFileChange = (path: string, content: string) => {
    setFiles(prev => ({ ...prev, [path]: { ...prev[path], content } }));
  };

  const handleAddFile = (path: string) => {
    setFiles(prev => ({ ...prev, [path]: { content: '', language: 'typescript' } }));
  };

  const handleDeleteFile = (path: string) => {
    setFiles(prev => {
      const next = { ...prev };
      delete next[path];
      return next;
    });
  };

  // Netlify Publishing
  const handleDeploy = async (subdomain: string, siteTitle: string, faviconSvg: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Unauthorized');
    if (!projectIdRef.current) throw new Error('Create and save a project first before deploying.');

    const result = await deployToNetlify(
      projectIdRef.current,
      files,
      subdomain,
      netlifySiteId || undefined,
      siteTitle,
      faviconSvg
    );

    setDeployedUrl(result.url);
    setNetlifySiteId(result.siteId);
    setNetlifySubdomain(result.subdomain);
    setPublishedAppTitle(siteTitle);

    await supabase
      .from('ide_projects')
      .update({
        title: siteTitle,
        netlify_url: result.url,
        netlify_site_id: result.siteId,
        netlify_subdomain: result.subdomain,
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
        <header className="px-3 py-2 bg-[#0f1117]/95 border-b border-white/10 backdrop-blur-2xl flex items-center justify-between shrink-0 z-30 pt-[max(0.5rem,env(safe-area-inset-top,0px))]">
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
      <div className={cn(
        "flex-1 min-h-0 overflow-hidden relative",
        isMobile ? "m-0 rounded-none border-0 bg-[#08090c]" : "mx-3 mb-2 rounded-2xl border border-white/5 bg-[#0b0c10] shadow-2xl"
      )}>
        {isMobile ? (
          <>
            {/* Mobile Workspace Panels - All kept mounted to preserve live sandbox iframe state */}
            <div className={cn("absolute inset-0 pb-14", activeTab === 'chat' ? "block" : "hidden pointer-events-none")}>
              <IDEChatPanel
                messages={messages}
                liveActions={liveActions}
                isLoading={isAgentRunning}
                generatingId={generatingId}
                onSend={handleChatSend}
                onGoHome={handleGoHome}
                onSelectFile={(path) => {
                  setSelectedFile(path);
                  setActiveTab('code');
                }}
                syncStatus={syncStatus}
                onViewPreview={() => setActiveTab('preview')}
              />
            </div>
            <div className={cn("absolute inset-0 pb-14", activeTab === 'preview' ? "block" : "hidden pointer-events-none")}>
              <IDEPreviewPanel 
                files={files} 
                onError={handlePreviewError} 
                deployedUrl={deployedUrl}
                onPublishClick={() => setShowPublishDialog(true)}
                projectId={projectIdRef.current || ideProjectId}
                isBuilding={isAgentRunning}
              />
            </div>
            <div className={cn("absolute inset-0 pb-14", activeTab === 'code' ? "block" : "hidden pointer-events-none")}>
              <IDECodeEditor 
                files={files} 
                selectedFile={selectedFile} 
                setSelectedFile={setSelectedFile} 
                onFileChange={handleFileChange}
                onAddFile={handleAddFile}
                onDeleteFile={handleDeleteFile}
              />
            </div>
            <div className={cn("absolute inset-0 pb-14 overflow-y-auto bg-[#0b0c10]", activeTab === 'cloud' ? "block" : "hidden pointer-events-none")}>
              <IDECloudPanel 
                files={files} 
                setFiles={setFiles} 
                onChatSend={handleChatSend}
                isAgentRunning={isAgentRunning}
                projectId={projectIdRef.current || ideProjectId}
              />
            </div>

            {/* Floating Glass Mobile Bottom Navigation Dock */}
            <nav className="fixed bottom-0 inset-x-0 z-40 bg-[#0c0d12]/95 backdrop-blur-2xl border-t border-white/10 px-2 py-1 pb-[max(0.375rem,env(safe-area-inset-bottom,0px))] flex items-center justify-around shadow-[0_-8px_32px_rgba(0,0,0,0.6)]">
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
          <ResizablePanelGroup direction="horizontal" className="h-full min-h-0">
            {/* Left AI Sidecar Chat */}
            <ResizablePanel defaultSize={32} minSize={22} maxSize={45} className="min-w-[280px] h-full min-h-0">
              <IDEChatPanel
                messages={messages}
                liveActions={liveActions}
                isLoading={isAgentRunning}
                generatingId={generatingId}
                onSend={handleChatSend}
                onGoHome={handleGoHome}
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
                  />
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>

      <PublishDialog
        open={showPublishDialog}
        onOpenChange={setShowPublishDialog}
        currentAppTitle={publishedAppTitle}
        currentSubdomain={netlifySubdomain}
        deployedUrl={deployedUrl}
        siteId={netlifySiteId}
        onPublish={handleDeploy}
        onUnpublish={handleUnpublish}
      />
    </div>
  );
}
