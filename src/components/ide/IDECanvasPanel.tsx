import { useState, useCallback, useEffect, useRef } from 'react';
import { useArcStore } from '@/store/useArcStore';
import { ArrowLeft, Code2, Eye, Download, Copy, Check, MessageSquare, Sparkles, Save, Cloud, CloudOff, History, RotateCcw, Rocket, ExternalLink } from 'lucide-react';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useIDEStore } from '@/store/useIDEStore';
import { FileExplorer } from './FileExplorer';
import { IDECodeEditor } from './IDECodeEditor';
import { IDEPreviewPanel } from './IDEPreviewPanel';
import { IDEChatPanel } from './IDEChatPanel';
import { PublishDialog } from './PublishDialog';
import { sendAgentMessage, type AgentResult } from '@/services/agent';
import { deployToNetlify, unpublishFromNetlify } from '@/lib/deploy';
import { getModelForTask } from '@/store/useModelStore';
import { supabase } from '@/integrations/supabase/client';
import type { VirtualFileSystem, AgentAction } from '@/types/ide';
import { DEFAULT_FILES } from '@/types/ide';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  agentActions?: AgentAction[];
}

interface ProjectVersion {
  id: string;
  files: VirtualFileSystem;
  timestamp: number;
  label: string;
}

interface IDECanvasPanelProps {
  className?: string;
  onClose?: () => void;
}

const buildPersistenceSnapshot = (nextFiles: VirtualFileSystem, nextMessages: ChatMessage[]) =>
  JSON.stringify({ files: nextFiles, messages: nextMessages });

export function IDECanvasPanel({ className, onClose }: IDECanvasPanelProps) {
  const { ideFiles, idePrompt, ideAutoRunPrompt, ideProjectId, ideMessages: storedMessages, setIdeFiles, closeIDE, setIdeIsRunning, setIdeActions, clearIdePrompt, setIdeProjectId, setIdeMessages } = useIDEStore();
  const [files, setFiles] = useState<VirtualFileSystem>(ideFiles || DEFAULT_FILES);
  const [selectedFile, setSelectedFile] = useState<string | null>('src/App.tsx');
  const [activeTab, setActiveTab] = useState<'code' | 'preview'>('code');
  const [mobileCodeTab, setMobileCodeTab] = useState<'chat' | 'editor'>('chat');
  const [copied, setCopied] = useState(false);
  const [messages, setMessagesRaw] = useState<ChatMessage[]>(storedMessages?.length ? storedMessages : []);
  const setMessages: typeof setMessagesRaw = useCallback((update) => {
    setMessagesRaw(prev => {
      const next = typeof update === 'function' ? update(prev) : update;
      setIdeMessages(next);
      return next;
    });
  }, [setIdeMessages]);
  const [liveActions, setLiveActions] = useState<AgentAction[]>([]);
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved');
  const syncStatusRef = useRef<'saved' | 'saving' | 'unsaved' | 'error'>('saved');
  const [projectVersions, setProjectVersions] = useState<ProjectVersion[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [deployedUrl, setDeployedUrl] = useState<string | null>(null);
  const [netlifySiteId, setNetlifySiteId] = useState<string | null>(null);
  const [netlifySubdomain, setNetlifySubdomain] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filesRef = useRef<VirtualFileSystem>(files);
  const messagesRef = useRef<ChatMessage[]>(messages);
  const autoFixedRef = useRef(false);
  const projectVersionsRef = useRef<ProjectVersion[]>([]);
  const lastSavedSnapshotRef = useRef(buildPersistenceSnapshot(ideFiles || DEFAULT_FILES, storedMessages?.length ? storedMessages : []));
  const projectIdRef = useRef<string | null>(ideProjectId);
  const didAutoRunInitialPromptRef = useRef(false);

  // Keep refs in sync so save operations always persist the freshest state
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    projectVersionsRef.current = projectVersions;
  }, [projectVersions]);

  // Sync files to store
  useEffect(() => {
    setIdeFiles(files);
  }, [files, setIdeFiles]);

  // On mount: hydrate from store/db and initialize saved snapshot baseline
  useEffect(() => {
    const initialFiles = ideFiles && Object.keys(ideFiles).length > 0 ? ideFiles : DEFAULT_FILES;
    const initialMessages = storedMessages?.length ? (storedMessages as ChatMessage[]) : [];

    if (ideFiles && Object.keys(ideFiles).length > 0) {
      setFiles(ideFiles);
      filesRef.current = ideFiles;
    }

    if (storedMessages?.length) {
      setMessagesRaw(storedMessages as ChatMessage[]);
      messagesRef.current = storedMessages as ChatMessage[];
    }

    lastSavedSnapshotRef.current = buildPersistenceSnapshot(initialFiles, initialMessages);

    if (ideProjectId) {
      projectIdRef.current = ideProjectId;
      setSyncStatus('saved');

      // Load netlify state and messages from database
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
            setIdeMessages(dbMessages as ChatMessage[]);
            messagesRef.current = dbMessages as ChatMessage[];
            lastSavedSnapshotRef.current = buildPersistenceSnapshot(filesRef.current, dbMessages as ChatMessage[]);
          }
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track file/message changes and auto-save
  useEffect(() => {
    const currentSnapshot = buildPersistenceSnapshot(files, messages);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, messages]);

  // Save project to database
  const saveProject = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const filesToPersist = filesRef.current;
      const messagesToPersist = messagesRef.current;
      const versionsToPersist = projectVersionsRef.current;

      setSyncStatus('saving');

      const newVersion: ProjectVersion = {
        id: crypto.randomUUID(),
        files: { ...filesToPersist },
        timestamp: Date.now(),
        label: `v${versionsToPersist.length + 1}`,
      };

      if (projectIdRef.current) {
        const { error } = await supabase
          .from('ide_projects')
          .update({
            files: filesToPersist as any,
            versions: [...versionsToPersist.slice(-19), newVersion] as any,
            version: (versionsToPersist.length || 0) + 1,
            messages: messagesToPersist as any,
          })
          .eq('id', projectIdRef.current);

        if (error) throw error;
      } else {
        const firstPrompt = messagesToPersist.find((m) => m.role === 'user')?.content || '';
        const projectTitle = firstPrompt ? firstPrompt.slice(0, 100) : 'Untitled Project';

        const { data, error } = await supabase
          .from('ide_projects')
          .insert({
            user_id: session.user.id,
            title: projectTitle,
            prompt: firstPrompt,
            files: filesToPersist as any,
            versions: [newVersion] as any,
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

      setProjectVersions((prev) => {
        const next = [...prev.slice(-19), newVersion];
        projectVersionsRef.current = next;
        return next;
      });

      lastSavedSnapshotRef.current = buildPersistenceSnapshot(filesToPersist, messagesToPersist);
      setSyncStatus('saved');

      // Update the IDE message in chat with projectId and file count
      const fileCount = Object.keys(filesToPersist).length;
      const pid = projectIdRef.current;
      if (pid) {
        useArcStore.setState((state) => ({
          messages: state.messages.map((m) =>
            m.type === 'ide'
              ? { ...m, ideProjectId: pid, ideFileCount: fileCount }
              : m
          ),
        }));
      }
    } catch (err) {
      console.error('Failed to save project:', err);
      setSyncStatus('error');
    }
  }, [setIdeProjectId]);

  // Keep syncStatusRef current so the unmount handler sees the latest value
  useEffect(() => { syncStatusRef.current = syncStatus; }, [syncStatus]);

  // Save on unmount if there are unsaved changes — empty deps so this only
  // runs cleanup on true unmount, not on every syncStatus/saveProject change
  // (previously those deps caused the cleanup to re-fire and loop 330+ times).
  const saveProjectRef = useRef(saveProject);
  useEffect(() => { saveProjectRef.current = saveProject; }, [saveProject]);
  useEffect(() => {
    return () => {
      if (syncStatusRef.current === 'unsaved' || syncStatusRef.current === 'saving') {
        void saveProjectRef.current();
      }
    };
  }, []);

  const restoreVersion = useCallback((version: ProjectVersion) => {
    setFiles(version.files);
    setShowVersions(false);
    toast({ title: `Restored ${version.label}` });
  }, [toast]);

  const runAgent = useCallback(async (prompt: string, chatHistory: ChatMessage[] = [], assistantId?: string) => {
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
      const model = getModelForTask('code');

      // Convert chat history to the format the agent expects
      const historyForAgent = chatHistory
        .filter(m => m.content && m.content.trim())
        .map(m => ({ role: m.role, content: m.content }));

      const result: AgentResult = await sendAgentMessage(
        prompt,
        files,
        (action: AgentAction) => {
          setLiveActions(prev => [...prev, action]);
          setIdeActions(prev => [...prev, action]);
        },
        model,
        session?.access_token,
        historyForAgent
      );

      if (result.files && Object.keys(result.files).length > 0) {
        const merged = { ...files, ...result.files };
        if (result.deletions) {
          for (const path of result.deletions) delete merged[path];
        }
        setFiles(merged);
        const firstNew = Object.keys(result.files)[0];
        if (firstNew) setSelectedFile(firstNew);
        setActiveTab('preview');
      }

      const finalActions = [...liveActions];
      setMessages(prev => prev.map(msg =>
        msg.id === aId ? { ...msg, content: result.summary, agentActions: result.actions || finalActions } : msg
      ));

      // Auto-save after successful generation
      setTimeout(() => saveProject(), 500);

      toast({ title: 'Files updated!' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Something went wrong';
      setMessages(prev => prev.map(m => m.id === aId ? { ...m, content: `Error: ${msg}` } : m));
      toast({ title: msg, variant: 'destructive' });
    } finally {
      setIsAgentRunning(false);
      setIdeIsRunning(false);
      setGeneratingId(null);
      setLiveActions([]);
    }
  }, [files, toast, setIdeIsRunning, setIdeActions, saveProject]);

  // Reset auto-run ref when switching projects
  useEffect(() => {
    didAutoRunInitialPromptRef.current = false;
  }, [ideProjectId]);

  // Auto-run exactly once for an initial /build prompt, but keep manual IDE opens blank.
  useEffect(() => {
    if (!idePrompt) return;

    if (!ideAutoRunPrompt) {
      clearIdePrompt();
      return;
    }

    // Only skip if we already auto-ran OR if there are real user messages (not empty placeholders)
    const hasRealMessages = messages.some(m => m.role === 'user' && m.content?.trim());
    if (didAutoRunInitialPromptRef.current || hasRealMessages) {
      clearIdePrompt();
      return;
    }

    didAutoRunInitialPromptRef.current = true;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: idePrompt, timestamp: Date.now() };
    const assistantId = crypto.randomUUID();

    setMessages([
      userMsg,
      { id: assistantId, role: 'assistant', content: '', timestamp: Date.now() },
    ]);
    setGeneratingId(assistantId);
    clearIdePrompt();
    runAgent(idePrompt, [], assistantId);
  }, [idePrompt, ideAutoRunPrompt, messages, clearIdePrompt, runAgent, setMessages, ideProjectId]);

  const handleChatSend = useCallback((message: string) => {
    autoFixedRef.current = false;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: message, timestamp: Date.now() };
    const assistantId = crypto.randomUUID();
    setMessages(prev => [...prev, userMsg, { id: assistantId, role: 'assistant', content: '', timestamp: Date.now() }]);
    setGeneratingId(assistantId);
    runAgent(message, messages, assistantId);
  }, [messages, runAgent]);

  const handlePreviewError = useCallback((error: string) => {
    if (isAgentRunning || autoFixedRef.current) return;
    autoFixedRef.current = true;
    const fixMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: `Fix this runtime error:\n\n${error}`,
      timestamp: Date.now(),
    };
    const assistantId = crypto.randomUUID();
    setMessages(prev => [...prev, fixMsg, { id: assistantId, role: 'assistant', content: '', timestamp: Date.now() }]);
    setGeneratingId(assistantId);
    runAgent(fixMsg.content, messagesRef.current, assistantId);
  }, [isAgentRunning, runAgent, setMessages]);

  const handleFileChange = (path: string, content: string) => {
    setFiles(prev => ({ ...prev, [path]: { ...prev[path], content } }));
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
    a.download = `arc-project-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Project exported' });
  };

  const handleDeploy = async (subdomain: string, siteTitle: string, faviconSvg: string) => {
    const result = await deployToNetlify('arc-app', files, subdomain, netlifySiteId, siteTitle, faviconSvg);
    setDeployedUrl(result.url);
    setNetlifySiteId(result.siteId);
    setNetlifySubdomain(result.subdomain);
    // Save netlify info + favicon label to database
    if (projectIdRef.current) {
      // Extract favicon label from the SVG by finding which option was used
      const { FAVICON_OPTIONS } = await import('@/constants/faviconOptions');
      const matchedOption = FAVICON_OPTIONS.find(o => {
        const testSvg = faviconSvg;
        return testSvg.includes(o.bg) && testSvg.includes(o.color);
      });
      await supabase
        .from('ide_projects')
        .update({
          netlify_url: result.url,
          netlify_site_id: result.siteId,
          netlify_subdomain: result.subdomain,
          favicon_label: matchedOption?.label || null,
        } as any)
        .eq('id', projectIdRef.current);
    }
  };

  const handleUnpublish = async () => {
    if (!netlifySiteId) return;
    await unpublishFromNetlify(netlifySiteId);
    setDeployedUrl(null);
    setNetlifySiteId(null);
    setNetlifySubdomain(null);
    if (projectIdRef.current) {
      const { error } = await supabase
        .from('ide_projects')
        .update({
          netlify_url: null,
          netlify_site_id: null,
          netlify_subdomain: null,
        } as any)
        .eq('id', projectIdRef.current);
      if (error) throw new Error('Failed to clear publish state');
    }
    toast({ title: 'Site unpublished' });
  };

  const handleClose = async () => {
    const hasUnsavedChanges =
      buildPersistenceSnapshot(filesRef.current, messagesRef.current) !== lastSavedSnapshotRef.current;

    if (hasUnsavedChanges || syncStatus === 'saving' || syncStatus === 'unsaved') {
      await saveProject();
    }

    if (onClose) {
      onClose();
    } else {
      closeIDE();
    }
  };

  const fileCount = Object.keys(files).length;

  const SyncIndicator = () => (
    <div className={cn(
      "flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium transition-all",
      syncStatus === 'saved' && "text-emerald-400 bg-emerald-500/10",
      syncStatus === 'saving' && "text-primary bg-primary/10",
      syncStatus === 'unsaved' && "text-amber-400 bg-amber-500/10",
      syncStatus === 'error' && "text-destructive bg-destructive/10",
    )}>
      {syncStatus === 'saved' && <><Cloud className="w-3 h-3" /> Saved</>}
      {syncStatus === 'saving' && <><Cloud className="w-3 h-3 animate-pulse" /> Saving...</>}
      {syncStatus === 'unsaved' && <><CloudOff className="w-3 h-3" /> Unsaved</>}
      {syncStatus === 'error' && <><CloudOff className="w-3 h-3" /> Error</>}
    </div>
  );

  const EditorArea = (
    <div className="flex h-full">
      <div className="w-48 min-w-[140px] border-r border-border/30 shrink-0">
        <FileExplorer files={files} selectedFile={selectedFile} onSelectFile={setSelectedFile} />
      </div>
      <div className="flex-1">
        <IDECodeEditor files={files} selectedFile={selectedFile} onFileChange={handleFileChange} />
      </div>
    </div>
  );

  return (
    <div className={cn('h-screen flex flex-col bg-background', className)} style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      {/* Header */}
      <header className="h-auto min-h-[44px] px-2 sm:px-3 py-1.5 border-b border-border/30 flex flex-wrap items-center justify-between gap-1.5 shrink-0 bg-background/80 backdrop-blur-xl">
        <div className="flex items-center gap-1.5 min-w-0">
          <Button variant="ghost" size="icon" onClick={handleClose} className="h-7 w-7 shrink-0">
            <ArrowLeft className="h-3.5 w-3.5" />
          </Button>
          <div className="p-1.5 rounded-lg bg-primary/15">
            <Code2 className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="font-semibold text-sm truncate max-w-[120px] sm:max-w-none">App Builder</span>
          <span className="text-[10px] text-muted-foreground">{fileCount} files</span>
          {isAgentRunning && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
              <Sparkles className="w-3 h-3 animate-pulse" />
              <span className="text-[10px] font-medium">Building</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <SyncIndicator />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => saveProject()}
            disabled={syncStatus === 'saving' || syncStatus === 'saved'}
            className="h-7 w-7 p-0 text-muted-foreground"
            title="Save project"
          >
            <Save className="w-3.5 h-3.5" />
          </Button>
          <DropdownMenu open={showVersions} onOpenChange={setShowVersions}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground"
                title="Version history"
                disabled={projectVersions.length === 0}
              >
                <History className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 max-h-64 overflow-y-auto">
              {projectVersions.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">No versions yet</div>
              ) : (
                [...projectVersions].reverse().map((v) => (
                  <DropdownMenuItem
                    key={v.id}
                    onClick={() => restoreVersion(v)}
                    className="flex items-center gap-2"
                  >
                    <RotateCcw className="w-3 h-3 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium">{v.label}</span>
                      <span className="text-[10px] text-muted-foreground ml-2">
                        {new Date(v.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="sm" onClick={handleCopyAll} className="h-7 w-7 p-0 text-muted-foreground">
            {copied ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleExport} className="h-7 w-7 p-0 text-muted-foreground">
            <Download className="w-3.5 h-3.5" />
          </Button>
          {deployedUrl && !isMobile && (
            <a href={deployedUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] text-primary hover:underline max-w-[200px] truncate">
              <ExternalLink className="h-3 w-3 shrink-0" />
              {deployedUrl.replace('https://', '')}
            </a>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowPublishDialog(true)}
            className="h-7 px-2 text-muted-foreground gap-1"
            title="Publish to web"
          >
            <Rocket className="w-3.5 h-3.5" />
            {!isMobile && <span className="text-[10px]">{deployedUrl ? 'Update' : 'Publish'}</span>}
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden relative">
        {isMobile ? (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="h-full flex flex-col">
            <TabsList className="w-full justify-start rounded-none border-b border-border/30 bg-transparent px-3 h-9">
              <TabsTrigger value="code" className="gap-1.5 text-xs"><Code2 className="h-3.5 w-3.5" />Code</TabsTrigger>
              <TabsTrigger value="preview" className="gap-1.5 text-xs"><Eye className="h-3.5 w-3.5" />Preview</TabsTrigger>
            </TabsList>
            <TabsContent value="code" className="flex-1 m-0 relative">
              <div className="absolute inset-0 pb-12">
                {mobileCodeTab === 'chat' ? (
                  <IDEChatPanel
                    messages={messages}
                    liveActions={liveActions}
                    isLoading={isAgentRunning}
                    generatingId={generatingId}
                    onSend={handleChatSend}
                  />
                ) : (
                  EditorArea
                )}
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-12 border-t border-border/30 bg-background/80 backdrop-blur-xl flex items-center justify-around z-10">
                <button
                  onClick={() => setMobileCodeTab('chat')}
                  className={cn(
                    'flex flex-col items-center gap-0.5 px-6 py-1.5 rounded-lg transition-colors',
                    mobileCodeTab === 'chat' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <MessageSquare className="h-4 w-4" />
                  <span className="text-[10px] font-medium">Chat</span>
                </button>
                <button
                  onClick={() => setMobileCodeTab('editor')}
                  className={cn(
                    'flex flex-col items-center gap-0.5 px-6 py-1.5 rounded-lg transition-colors',
                    mobileCodeTab === 'editor' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Code2 className="h-4 w-4" />
                  <span className="text-[10px] font-medium">Code</span>
                </button>
              </div>
            </TabsContent>
            <TabsContent value="preview" className="flex-1 m-0 min-h-0">
              <IDEPreviewPanel files={files} onError={handlePreviewError} />
            </TabsContent>
          </Tabs>
        ) : (
          <ResizablePanelGroup direction="horizontal">
            <ResizablePanel defaultSize={28} minSize={20} maxSize={40}>
              <IDEChatPanel
                messages={messages}
                liveActions={liveActions}
                isLoading={isAgentRunning}
                generatingId={generatingId}
                onSend={handleChatSend}
              />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={72}>
              <div className="h-full flex flex-col">
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="h-full flex flex-col">
                  <TabsList className="w-full justify-start rounded-none border-b border-border/30 bg-transparent px-3 h-9">
                    <TabsTrigger value="code" className="gap-1.5 text-xs"><Code2 className="h-3.5 w-3.5" />Code</TabsTrigger>
                    <TabsTrigger value="preview" className="gap-1.5 text-xs"><Eye className="h-3.5 w-3.5" />Preview</TabsTrigger>
                  </TabsList>
                  <TabsContent value="code" className="flex-1 m-0">{EditorArea}</TabsContent>
                  <TabsContent value="preview" className="flex-1 m-0"><IDEPreviewPanel files={files} onError={handlePreviewError} /></TabsContent>
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
