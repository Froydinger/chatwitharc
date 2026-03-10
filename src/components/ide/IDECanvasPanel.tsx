import { useState, useCallback, useEffect } from 'react';
import { ChevronLeft, Code2, Eye, Download, Loader2, Sparkles, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCanvasStore } from '@/store/useCanvasStore';
import { FileExplorer } from './FileExplorer';
import { IDECodeEditor } from './IDECodeEditor';
import { IDEPreviewPanel } from './IDEPreviewPanel';
import { AgentTimeline } from './AgentTimeline';
import { sendAgentMessage, type AgentResult } from '@/services/agent';
import { getModelForTask } from '@/store/useModelStore';
import { supabase } from '@/integrations/supabase/client';
import type { VirtualFileSystem, AgentAction } from '@/types/ide';
import { DEFAULT_FILES } from '@/types/ide';

interface IDECanvasPanelProps {
  className?: string;
}

export function IDECanvasPanel({ className }: IDECanvasPanelProps) {
  const { ideFiles, ideActions, ideIsRunning, idePrompt, setIdeFiles, setIdeActions, setIdeIsRunning, clearIdePrompt, closeCanvas } = useCanvasStore();
  const [files, setFiles] = useState<VirtualFileSystem>(ideFiles || DEFAULT_FILES);
  const [selectedFile, setSelectedFile] = useState<string | null>('src/App.tsx');
  const [activeTab, setActiveTab] = useState<'code' | 'preview'>('code');
  const [copied, setCopied] = useState(false);
  const isMobile = useIsMobile();
  const { toast } = useToast();
  // Sync files to store when they change
  useEffect(() => { setIdeFiles(files); }, [files, setIdeFiles]);

  // Sync ideFiles from store if loaded from session
  useEffect(() => {
    if (ideFiles && Object.keys(ideFiles).length > 0) {
      setFiles(ideFiles);
    }
  }, []);

  // Auto-process initial prompt — grab and clear atomically to prevent
  // double-fires from React strict-mode remounts
  useEffect(() => {
    const prompt = useCanvasStore.getState().idePrompt;
    if (prompt && !useCanvasStore.getState().ideIsRunning) {
      clearIdePrompt(); // clear first so remount won't re-trigger
      runAgent(prompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runAgent = useCallback(async (prompt: string) => {
    setIdeIsRunning(true);
    setIdeActions([]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const model = getModelForTask('code');

      const result: AgentResult = await sendAgentMessage(
        prompt,
        files,
        (action: AgentAction) => {
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
        // Auto-select first changed file
        const firstNew = Object.keys(result.files)[0];
        if (firstNew) setSelectedFile(firstNew);
        setActiveTab('preview');
        toast({ title: 'Files updated!' });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Something went wrong';
      toast({ title: msg, variant: 'destructive' });
    } finally {
      setIdeIsRunning(false);
    }
  }, [files, toast, setIdeIsRunning, setIdeActions]);

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

  return (
    <div className={cn('flex flex-col h-full bg-background', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/20 bg-gradient-to-r from-background/80 via-background/60 to-background/80 backdrop-blur-xl shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={closeCanvas} className="h-8 w-8 p-0 rounded-xl text-muted-foreground hover:text-foreground">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/15">
              <Code2 className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="text-sm font-semibold hidden sm:inline">App Builder</span>
            <span className="text-[10px] text-muted-foreground hidden sm:inline">{fileCount} files</span>
          </div>
          {ideIsRunning && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
              <Sparkles className="w-3 h-3 animate-pulse" />
              <span className="text-[10px] font-medium">Building</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={handleCopyAll} className="h-8 w-8 p-0 rounded-xl text-muted-foreground">
            {copied ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleExport} className="h-8 w-8 p-0 rounded-xl text-muted-foreground">
            <Download className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Agent Timeline */}
      {(ideIsRunning || (ideActions && ideActions.length > 0)) && (
        <div className="px-3 py-2 border-b border-border/20 bg-muted/20 max-h-32 overflow-y-auto">
          <AgentTimeline actions={ideActions || []} isRunning={ideIsRunning} />
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {isMobile ? (
          <Tabs value={activeTab} onValueChange={v => setActiveTab(v as 'code' | 'preview')} className="flex-1 flex flex-col">
            <TabsList className="w-full justify-start rounded-none border-b border-border/30 bg-transparent px-3 h-9 shrink-0">
              <TabsTrigger value="code" className="gap-1.5 text-xs"><Code2 className="h-3.5 w-3.5" />Code</TabsTrigger>
              <TabsTrigger value="preview" className="gap-1.5 text-xs"><Eye className="h-3.5 w-3.5" />Preview</TabsTrigger>
            </TabsList>
            <TabsContent value="code" className="flex-1 m-0 flex">
              <div className="w-1/3 min-w-[120px] max-w-[180px] border-r border-border/30">
                <FileExplorer files={files} selectedFile={selectedFile} onSelectFile={setSelectedFile} />
              </div>
              <div className="flex-1">
                <IDECodeEditor files={files} selectedFile={selectedFile} onFileChange={handleFileChange} />
              </div>
            </TabsContent>
            <TabsContent value="preview" className="flex-1 m-0">
              <IDEPreviewPanel files={files} />
            </TabsContent>
          </Tabs>
        ) : (
          <>
            {/* File Explorer */}
            <div className="w-48 min-w-[160px] border-r border-border/30 shrink-0">
              <FileExplorer files={files} selectedFile={selectedFile} onSelectFile={setSelectedFile} />
            </div>

            {/* Code + Preview */}
            <div className="flex-1 flex flex-col">
              <Tabs value={activeTab} onValueChange={v => setActiveTab(v as 'code' | 'preview')} className="flex-1 flex flex-col">
                <TabsList className="w-full justify-start rounded-none border-b border-border/30 bg-transparent px-3 h-9 shrink-0">
                  <TabsTrigger value="code" className="gap-1.5 text-xs"><Code2 className="h-3.5 w-3.5" />Code</TabsTrigger>
                  <TabsTrigger value="preview" className="gap-1.5 text-xs"><Eye className="h-3.5 w-3.5" />Preview</TabsTrigger>
                </TabsList>
                <TabsContent value="code" className="flex-1 m-0">
                  <IDECodeEditor files={files} selectedFile={selectedFile} onFileChange={handleFileChange} />
                </TabsContent>
                <TabsContent value="preview" className="flex-1 m-0">
                  <IDEPreviewPanel files={files} />
                </TabsContent>
              </Tabs>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
