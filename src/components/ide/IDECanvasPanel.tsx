import { useState, useCallback, useEffect, useRef } from 'react';
import { ArrowLeft, Code2, Eye, Download, Copy, Check, MessageSquare, Sparkles, Save, Cloud, CloudOff, History, RotateCcw } from 'lucide-react';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCanvasStore } from '@/store/useCanvasStore';
import { FileExplorer } from './FileExplorer';
import { IDECodeEditor } from './IDECodeEditor';
import { IDEPreviewPanel } from './IDEPreviewPanel';
import { IDEChatPanel } from './IDEChatPanel';
import { sendAgentMessage, type AgentResult } from '@/services/agent';
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
}

export function IDECanvasPanel({ className }: IDECanvasPanelProps) {
  const { ideFiles, idePrompt, ideProjectId, setIdeFiles, closeCanvas, setIdeIsRunning, setIdeActions, clearIdePrompt, setIdeProjectId } = useCanvasStore();
  const [files, setFiles] = useState<VirtualFileSystem>(ideFiles || DEFAULT_FILES);
  const [selectedFile, setSelectedFile] = useState<string | null>('src/App.tsx');
  const [activeTab, setActiveTab] = useState<'code' | 'preview'>('code');
  const [mobileCodeTab, setMobileCodeTab] = useState<'chat' | 'editor'>('chat');
  const [copied, setCopied] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [liveActions, setLiveActions] = useState<AgentAction[]>([]);
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved');
  const [projectVersions, setProjectVersions] = useState<ProjectVersion[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedFilesRef = useRef<string>('');
  const projectIdRef = useRef<string | null>(ideProjectId);

  // Sync files to store
  useEffect(() => { setIdeFiles(files); }, [files, setIdeFiles]);

  // Sync ideFiles from store if loaded from session
  useEffect(() => {
    if (ideFiles && Object.keys(ideFiles).length > 0) {
      setFiles(ideFiles);
    }
  }, []);

  // Track file changes for auto-save
  useEffect(() => {
    const currentHash = JSON.stringify(files);
    if (currentHash !== lastSavedFilesRef.current && lastSavedFilesRef.current !== '') {
      setSyncStatus('unsaved');
      // Auto-save after 3 seconds of no changes
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = setTimeout(() => {
        saveProject();
      }, 3000);
    }
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [files]);

  // Save project to database
  const saveProject = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      setSyncStatus('saving');
      const filesJson = JSON.stringify(files);

      // Create version snapshot
      const newVersion: ProjectVersion = {
        id: crypto.randomUUID(),
        files: { ...files },
        timestamp: Date.now(),
        label: `v${projectVersions.length + 1}`,
      };

      if (projectIdRef.current) {
        // Update existing project
        const { error } = await supabase
          .from('ide_projects')
          .update({
            files: files as any,
            versions: [...projectVersions.slice(-19), newVersion] as any, // Keep last 20 versions
            version: (projectVersions.length || 0) + 1,
          })
          .eq('id', projectIdRef.current);

        if (error) throw error;
      } else {
        // Create new project
        const firstPrompt = messages.find(m => m.role === 'user')?.content || 'Untitled Project';
        const { data, error } = await supabase
          .from('ide_projects')
          .insert({
            user_id: session.user.id,
            title: firstPrompt.slice(0, 100),
            prompt: firstPrompt,
            files: files as any,
            versions: [newVersion] as any,
          })
          .select('id')
          .single();

        if (error) throw error;
        if (data) {
          projectIdRef.current = data.id;
          setIdeProjectId(data.id);
        }
      }

      setProjectVersions(prev => [...prev.slice(-19), newVersion]);
      lastSavedFilesRef.current = filesJson;
      setSyncStatus('saved');
    } catch (err) {
      console.error('Failed to save project:', err);
      setSyncStatus('error');
    }
  }, [files, messages, projectVersions, setIdeProjectId]);

  // Load project from database on mount if we have a projectId
  useEffect(() => {
    if (ideProjectId) {
      loadProject(ideProjectId);
    } else {
      lastSavedFilesRef.current = JSON.stringify(files);
    }
  }, []);

  const loadProject = async (pid: string) => {
    try {
      const { data, error } = await supabase
        .from('ide_projects')
        .select('*')
        .eq('id', pid)
        .single();

      if (error) throw error;
      if (data) {
        const loadedFiles = data.files as unknown as VirtualFileSystem;
        setFiles(loadedFiles);
        lastSavedFilesRef.current = JSON.stringify(loadedFiles);
        const loadedVersions = (data.versions as unknown as ProjectVersion[]) || [];
        setProjectVersions(loadedVersions);
        projectIdRef.current = pid;
        setSyncStatus('saved');
      }
    } catch (err) {
      console.error('Failed to load project:', err);
    }
  };

  // Restore a version
  const restoreVersion = useCallback((version: ProjectVersion) => {
    setFiles(version.files);
    setShowVersions(false);
    toast({ title: `Restored ${version.label}` });
  }, [toast]);

  // Save on close
  useEffect(() => {
    return () => {
      // Save when unmounting (closing IDE)
      if (syncStatus === 'unsaved' && projectIdRef.current) {
        saveProject();
      }
    };
  }, [syncStatus, saveProject]);

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

      const result: AgentResult = await sendAgentMessage(
        prompt,
        files,
        (action: AgentAction) => {
          setLiveActions(prev => [...prev, action]);
          setIdeActions(prev => [...prev, action]);
        },
        model,
        session?.access_token
      );

      if (result.files) {
        const merged = { ...files, ...result.files };
        if (result.deletions) {
          for (const path of result.deletions) delete merged[path];
        }
        setFiles(merged);
        const firstNew = Object.keys(result.files)[0];
        if (firstNew) setSelectedFile(firstNew);
        setActiveTab('preview');
      }

      // Update assistant message with final content
      const finalActions = [...liveActions];
      setMessages(prev => prev.map(msg =>
        msg.id === aId ? { ...msg, content: result.summary || 'Done!', agentActions: result.actions || finalActions } : msg
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

  // Auto-process initial prompt ONLY for new projects (idePrompt is set)
  useEffect(() => {
    const prompt = useCanvasStore.getState().idePrompt;
    if (prompt && !useCanvasStore.getState().ideIsRunning) {
      clearIdePrompt();
      const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: prompt, timestamp: Date.now() };
      const assistantId = crypto.randomUUID();
      setMessages([userMsg, { id: assistantId, role: 'assistant', content: '', timestamp: Date.now() }]);
      setGeneratingId(assistantId);
      runAgent(prompt, [], assistantId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChatSend = useCallback((message: string) => {
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: message, timestamp: Date.now() };
    const assistantId = crypto.randomUUID();
    setMessages(prev => [...prev, userMsg, { id: assistantId, role: 'assistant', content: '', timestamp: Date.now() }]);
    setGeneratingId(assistantId);
    runAgent(message, messages, assistantId);
  }, [messages, runAgent]);

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

  const handleClose = () => {
    // Save before closing
    if (syncStatus === 'unsaved') {
      saveProject();
    }
    closeCanvas();
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
    <div className={cn('h-screen flex flex-col bg-background', className)}>
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
          {/* Version History */}
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
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden relative">
        {isMobile ? (
          /* Mobile: Tabs for Code/Preview, with sub-tabs for Chat/Editor */
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
              {/* Bottom tab bar */}
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
              <IDEPreviewPanel files={files} />
            </TabsContent>
          </Tabs>
        ) : (
          /* Desktop: Resizable Chat | Code+Preview */
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
                  <TabsContent value="preview" className="flex-1 m-0"><IDEPreviewPanel files={files} /></TabsContent>
                </Tabs>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
    </div>
  );
}
