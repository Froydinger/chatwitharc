import { useState, useCallback, useEffect, useRef } from 'react';
import { useArcStore } from '@/store/useArcStore';
import { useSubscription } from '@/hooks/useSubscription';
import { 
  ArrowLeft, Code2, Eye, Download, Copy, Check, Sparkles, Cloud, Trash2, Rocket, Plus, ExternalLink, Calendar, Loader2, Play 
} from 'lucide-react';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useIDEStore } from '@/store/useIDEStore';
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
}

interface IDECanvasPanelProps {
  className?: string;
  onClose?: () => void;
}

const buildPersistenceSnapshot = (nextFiles: VirtualFileSystem, nextMessages: ChatMessage[]) =>
  JSON.stringify({ files: nextFiles, messages: nextMessages });

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
    return storeFiles && Object.keys(storeFiles).length > 0 ? storeFiles : DEFAULT_FILES;
  });
  const [selectedFile, setSelectedFile] = useState<string | null>('src/App.tsx');
  const [activeTab, setActiveTab] = useState<'preview' | 'code' | 'cloud'>('preview');
  const [mobileCodeTab, setMobileCodeTab] = useState<'chat' | 'editor'>('chat');
  const [copied, setCopied] = useState(false);
  
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
  
  const [projects, setProjects] = useState<LovableProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [newProjectPrompt, setNewProjectPrompt] = useState('');

  const isMobile = useIsMobile();
  const { toast } = useToast();
  
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
      if (storeFiles && Object.keys(storeFiles).length > 0) {
        initialFiles = storeFiles;
        setFiles(storeFiles);
        filesRef.current = storeFiles;
      } else {
        const savedLocal = localStorage.getItem('arc_ide_local_snapshot');
        if (savedLocal) {
          try {
            const parsed = JSON.parse(savedLocal);
            if (parsed.files && Object.keys(parsed.files).length > 0) {
              initialFiles = parsed.files;
              setFiles(parsed.files);
              filesRef.current = parsed.files;
            }
            if (parsed.messages && parsed.messages.length > 0) {
              initialMessages = parsed.messages;
              setMessagesRaw(parsed.messages);
              messagesRef.current = parsed.messages;
            }
          } catch (e) {
            console.error('Failed to parse local IDE snapshot:', e);
          }
        }
      }
      if (storeMsgs && storeMsgs.length > 0) {
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
        initialFiles = storeFiles;
        setFiles(storeFiles);
        filesRef.current = storeFiles;
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
      .select('netlify_url, netlify_site_id, netlify_subdomain, messages')
      .eq('id', ideProjectId)
      .single()
      .then(({ data }) => {
        if (!data) return;

        setDeployedUrl((data as any).netlify_url || null);
        setNetlifySiteId((data as any).netlify_site_id || null);
        setNetlifySubdomain((data as any).netlify_subdomain || null);

        const dbMessages = (data as any).messages;
        if (Array.isArray(dbMessages) && dbMessages.length > 0 && messagesRef.current.length === 0) {
          setMessagesRaw(dbMessages as ChatMessage[]);
          useIDEStore.getState().setIdeMessages(dbMessages as ChatMessage[]);
          messagesRef.current = dbMessages as ChatMessage[];
          lastSavedSnapshotRef.current = buildPersistenceSnapshot(filesRef.current, dbMessages as ChatMessage[]);
        }
      });
  }, [ideProjectId]);

  // Auto-saving snapshot listener
  useEffect(() => {
    const currentSnapshot = buildPersistenceSnapshot(files, messages);

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

      if (projectIdRef.current) {
        const { error } = await supabase
          .from('ide_projects')
          .update({
            files: filesToPersist as any,
            messages: messagesToPersist as any,
          })
          .eq('id', projectIdRef.current);

        if (error) throw error;
      } else {
        const firstPrompt = messagesToPersist.find((m) => m.role === 'user')?.content || 'Arc App';
        const projectTitle = firstPrompt ? firstPrompt.slice(0, 100) : 'Untitled Project';

        const { data, error } = await supabase
          .from('ide_projects')
          .insert({
            user_id: session.user.id,
            title: projectTitle,
            prompt: firstPrompt,
            files: filesToPersist as any,
            messages: messagesToPersist as any,
          })
          .select('id')
          .single();

        if (error) throw error;

        if (data) {
          projectIdRef.current = data.id;
          setIdeProjectId(data.id);
        }
      }

      lastSavedSnapshotRef.current = buildPersistenceSnapshot(filesToPersist, messagesToPersist);
      setSyncStatus('saved');
    } catch (err) {
      console.error('Failed to save project:', err);
      setSyncStatus('error');
    }
  }, [setIdeProjectId]);

  useEffect(() => { syncStatusRef.current = syncStatus; }, [syncStatus]);

  // Open project from dashboard
  const handleOpenProject = (p: LovableProject) => {
    setFiles(p.files || DEFAULT_FILES);
    setMessagesRaw(p.messages || []);
    setIdeFiles(p.files || DEFAULT_FILES);
    setIdeMessages(p.messages || []);
    setIdeProjectId(p.id);
    projectIdRef.current = p.id;
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

    setFiles(DEFAULT_FILES);
    setMessagesRaw([]);
    setIdeFiles(DEFAULT_FILES);
    setIdeMessages([]);
    setIdeProjectId(null);
    projectIdRef.current = null;

    const initialPrompt = newProjectPrompt.trim();
    setNewProjectPrompt('');
    
    setIdeProjectId('temp-new-project'); // temporary value to trigger view transition
    setTimeout(() => {
      handleChatSend(initialPrompt);
    }, 100);
  };

  // Chat message sender
  const runAgent = useCallback(async (prompt: string, chatHistory: ChatMessage[] = [], assistantId?: string) => {
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
    if (!assistantId) {
      setGeneratingId(aId);
      setMessages(prev => [...prev, { id: aId, role: 'assistant', content: '', timestamp: Date.now() }]);
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const model = 'gpt-5.6-luna';

      const historyForAgent = chatHistory
        .filter((m) => m.content && m.content.trim())
        .map((m) => ({ role: m.role, content: m.content }));

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
      );

      const hasWrittenFiles = !!result.files && Object.keys(result.files).length > 0;
      const hasDeletions = Array.isArray(result.deletions) && result.deletions.length > 0;

      if (hasWrittenFiles || hasDeletions) {
        setFiles((prev) => {
          const merged: VirtualFileSystem = { ...prev, ...(result.files || {}) };
          for (const path of result.deletions || []) {
            delete merged[path];
          }
          return merged;
        });

        const firstNew = hasWrittenFiles ? Object.keys(result.files!)[0] : null;
        if (firstNew) setSelectedFile(firstNew);
      }

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === aId
            ? {
                ...msg,
                content: result.summary,
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
    }
  }, [hasBoost, isAdmin, openCheckout, setIdeActions, setIdeIsRunning, setMessages, toast]);

  const handleChatSend = useCallback((message: string) => {
    autoFixedRef.current = false;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: message, timestamp: Date.now() };
    const assistantId = crypto.randomUUID();
    
    setMessages(prev => [...prev, userMsg, { id: assistantId, role: 'assistant', content: '', timestamp: Date.now() }]);
    setGeneratingId(assistantId);
    runAgent(message, messagesRef.current, assistantId);
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

    await supabase
      .from('ide_projects')
      .update({
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

  const handleExport = () => {
    const allCode = Object.entries(files)
      .map(([path, file]) => `// === ${path} ===\n${file.content}`)
      .join('\n\n');
    const blob = new Blob([allCode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `arc-app-export.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleGoHome = () => {
    setIdeProjectId(null);
    projectIdRef.current = null;
    if (onClose) onClose();
  };

  // Render Workspace
  return (
    <div className={cn("h-full flex flex-col bg-[#0b0c0e] text-foreground", className)}>
      {/* Header */}
      <header className="px-4 py-2.5 border-b border-border/10 bg-[#0d0e10] flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center gap-3">
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={handleGoHome}
            className="h-7 px-2.5 rounded-lg hover:bg-white/5 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Dashboard</span>
          </Button>
          <div className="h-4 w-[1px] bg-border/20 shrink-0" />
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold max-w-[200px] truncate">
              {messages.find(m => m.role === 'user')?.content?.slice(0, 50) || 'Active Workspace'}
            </span>
            <span className="text-[9px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 px-1 py-0.2 rounded uppercase tracking-wider select-none scale-90 origin-left">Beta</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleCopyAll} className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground">
            {copied ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleExport} className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground">
            <Download className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" onClick={closeIDE} className="text-xs h-7 px-3 rounded-lg hover:bg-white/5">
            Close Builder
          </Button>
        </div>
      </header>
      {!hasBoost && !isAdmin && (
        <div className="px-4 py-2 bg-gradient-to-r from-purple-500/10 via-primary/10 to-purple-500/10 border-b border-purple-500/20 flex items-center justify-between shrink-0 text-xs">
          <div className="flex items-center gap-2 text-purple-300">
            <Sparkles className="h-3.5 w-3.5 text-purple-400 shrink-0" />
            <span>ArcAI Boost is required to generate and edit apps.</span>
          </div>
          <Button
            size="sm"
            onClick={() => openCheckout()}
            className="h-6 px-2.5 text-[11px] rounded-md bg-purple-500 hover:bg-purple-600 text-white shadow-sm"
          >
            Upgrade to Boost
          </Button>
        </div>
      )}

      {/* Workspace Panel Split */}
      <div className="flex-1 overflow-hidden relative">
        {isMobile ? (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="h-full flex flex-col">
            <TabsList className="w-full justify-start rounded-none border-b border-border/10 bg-[#0d0e10] px-3 h-9 shrink-0">
              <TabsTrigger value="preview" className="gap-1.5 text-xs">Preview</TabsTrigger>
              <TabsTrigger value="code" className="gap-1.5 text-xs">Code</TabsTrigger>
            </TabsList>
            <TabsContent value="preview" className="flex-1 m-0 min-h-0">
              <IDEPreviewPanel 
                files={files} 
                onError={handlePreviewError} 
                deployedUrl={deployedUrl}
                onPublishClick={() => setShowPublishDialog(true)}
              />
            </TabsContent>
            <TabsContent value="code" className="flex-1 m-0 relative">
              <div className="absolute inset-0 pb-12">
                {mobileCodeTab === 'chat' ? (
                  <IDEChatPanel
                    messages={messages}
                    liveActions={liveActions}
                    isLoading={isAgentRunning}
                    generatingId={generatingId}
                    onSend={handleChatSend}
                    onGoHome={handleGoHome}
                    syncStatus={syncStatus}
                  />
                ) : (
                  <IDECodeEditor 
                    files={files} 
                    selectedFile={selectedFile} 
                    setSelectedFile={setSelectedFile} 
                    onFileChange={handleFileChange}
                    onAddFile={handleAddFile}
                    onDeleteFile={handleDeleteFile}
                  />
                )}
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          <ResizablePanelGroup direction="horizontal">
            <ResizablePanel defaultSize={32} minSize={20} maxSize={45}>
              <IDEChatPanel
                messages={messages}
                liveActions={liveActions}
                isLoading={isAgentRunning}
                generatingId={generatingId}
                onSend={handleChatSend}
                onGoHome={handleGoHome}
                syncStatus={syncStatus}
              />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={68}>
              <div className="h-full flex flex-col">
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="h-full flex flex-col">
                  <TabsList className="w-full justify-start rounded-none border-b border-border/10 bg-[#0d0e10] px-3 h-9 shrink-0">
                    <TabsTrigger value="preview" className="gap-1.5 text-xs">Preview</TabsTrigger>
                    <TabsTrigger value="code" className="gap-1.5 text-xs">Code</TabsTrigger>
                  </TabsList>
                  <TabsContent value="preview" className="flex-1 m-0 min-h-0">
                    <IDEPreviewPanel 
                      files={files} 
                      onError={handlePreviewError} 
                      deployedUrl={deployedUrl}
                      onPublishClick={() => setShowPublishDialog(true)}
                    />
                  </TabsContent>
                  <TabsContent value="code" className="flex-1 m-0">
                    <IDECodeEditor 
                      files={files} 
                      selectedFile={selectedFile} 
                      setSelectedFile={setSelectedFile} 
                      onFileChange={handleFileChange}
                      onAddFile={handleAddFile}
                      onDeleteFile={handleDeleteFile}
                    />
                  </TabsContent>
                </Tabs>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>

      <PublishDialog
        open={showPublishDialog}
        onOpenChange={setShowPublishDialog}
        projectName={messages.find(m => m.role === 'user')?.content?.slice(0, 50) || 'Arc App'}
        currentSubdomain={netlifySubdomain}
        deployedUrl={deployedUrl}
        siteId={netlifySiteId}
        onPublish={handleDeploy}
        onUnpublish={handleUnpublish}
      />
    </div>
  );
}
