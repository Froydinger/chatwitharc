import { useState, useCallback, useEffect, useRef } from 'react';
import { ArrowLeft, Code2, Eye, Download, Copy, Check, MessageSquare, Sparkles } from 'lucide-react';
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

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  agentActions?: AgentAction[];
}

interface IDECanvasPanelProps {
  className?: string;
}

export function IDECanvasPanel({ className }: IDECanvasPanelProps) {
  const { ideFiles, idePrompt, setIdeFiles, closeCanvas, setIdeIsRunning, setIdeActions, clearIdePrompt } = useCanvasStore();
  const [files, setFiles] = useState<VirtualFileSystem>(ideFiles || DEFAULT_FILES);
  const [selectedFile, setSelectedFile] = useState<string | null>('src/App.tsx');
  const [activeTab, setActiveTab] = useState<'code' | 'preview'>('code');
  const [mobileCodeTab, setMobileCodeTab] = useState<'chat' | 'editor'>('chat');
  const [copied, setCopied] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [liveActions, setLiveActions] = useState<AgentAction[]>([]);
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const { toast } = useToast();

  // Sync files to store
  useEffect(() => { setIdeFiles(files); }, [files, setIdeFiles]);

  // Sync ideFiles from store if loaded from session
  useEffect(() => {
    if (ideFiles && Object.keys(ideFiles).length > 0) {
      setFiles(ideFiles);
    }
  }, []);

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
  }, [files, toast, setIdeIsRunning, setIdeActions]);

  // Auto-process initial prompt
  useEffect(() => {
    const prompt = useCanvasStore.getState().idePrompt;
    if (prompt && !useCanvasStore.getState().ideIsRunning) {
      clearIdePrompt();
      // Add user message
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

  const fileCount = Object.keys(files).length;

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
          <Button variant="ghost" size="icon" onClick={closeCanvas} className="h-7 w-7 shrink-0">
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
