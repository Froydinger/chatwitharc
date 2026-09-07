import { useState, useRef, useEffect } from 'react';
import Editor, { type OnChange, type OnMount } from '@monaco-editor/react';
import type { VirtualFileSystem } from '@/types/ide';
import { getLanguageFromPath } from '@/lib/file-tree';
import { Loader2, Plus, Trash2, X, Folder, FilePlus, ChevronRight, ChevronDown, FolderOpen, PanelLeftClose, PanelLeft } from 'lucide-react';
import { FileExplorer } from './FileExplorer';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

interface IDECodeEditorProps {
  files: VirtualFileSystem;
  selectedFile: string | null;
  setSelectedFile: (path: string | null) => void;
  onFileChange: (path: string, content: string) => void;
  onAddFile?: (path: string) => void;
  onDeleteFile?: (path: string) => void;
}

export function IDECodeEditor({ 
  files, 
  selectedFile, 
  setSelectedFile, 
  onFileChange,
  onAddFile,
  onDeleteFile 
}: IDECodeEditorProps) {
  const isMobile = useIsMobile();
  const [openTabs, setOpenTabs] = useState<string[]>(['src/App.tsx']);
  const [showExplorer, setShowExplorer] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 768 : true);
  const [newFileName, setNewFileName] = useState('');
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const editorRef = useRef<any>(null);

  // Close sidebar by default on mobile screen
  useEffect(() => {
    if (isMobile) {
      setShowExplorer(false);
    }
  }, [isMobile]);

  // Add the currently selected file to tabs if not already present
  useEffect(() => {
    if (selectedFile && !openTabs.includes(selectedFile)) {
      setOpenTabs(prev => [...prev, selectedFile]);
    }
  }, [selectedFile, openTabs]);

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

  const handleChange: OnChange = (value) => {
    if (selectedFile && value !== undefined) {
      onFileChange(selectedFile, value);
    }
  };

  const closeTab = (tabToClose: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextTabs = openTabs.filter(t => t !== tabToClose);
    setOpenTabs(nextTabs);
    
    if (selectedFile === tabToClose) {
      if (nextTabs.length > 0) {
        setSelectedFile(nextTabs[nextTabs.length - 1]);
      } else {
        setSelectedFile(null);
      }
    }
  };

  const handleCreateFileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName.trim()) return;
    
    let path = newFileName.trim();
    if (!path.startsWith('src/')) {
      path = 'src/' + path;
    }
    
    if (onAddFile) {
      onAddFile(path);
      setSelectedFile(path);
      setIsCreatingFile(false);
      setNewFileName('');
      if (isMobile) {
        setShowExplorer(false);
      }
    }
  };

  const handleDeleteActiveFile = () => {
    if (selectedFile && onDeleteFile) {
      if (confirm(`Are you sure you want to delete ${selectedFile}?`)) {
        onDeleteFile(selectedFile);
        const nextTabs = openTabs.filter(t => t !== selectedFile);
        setOpenTabs(nextTabs);
        setSelectedFile(nextTabs.length > 0 ? nextTabs[0] : null);
      }
    }
  };

  const currentFile = selectedFile ? files[selectedFile] : null;
  const language = selectedFile ? getLanguageFromPath(selectedFile) : 'typescript';

  return (
    <div className="h-full flex bg-[#0c0d0e] border-t border-border/10 overflow-hidden relative">
      {/* Mobile File Explorer Drawer Overlay */}
      {isMobile ? (
        showExplorer && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex">
            <div className="w-72 max-w-[85vw] h-full bg-[#0d0e10] border-r border-white/10 flex flex-col shadow-2xl animate-in slide-in-from-left duration-200">
              <div className="px-3.5 py-3 border-b border-border/10 flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Folder className="h-3.5 w-3.5 text-primary" /> Workspace Files
                </span>
                <div className="flex items-center gap-1">
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    onClick={() => setIsCreatingFile(prev => !prev)}
                    className="h-7 w-7 rounded-lg hover:bg-white/5" 
                    title="Create File"
                  >
                    <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                  {selectedFile && (
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      onClick={handleDeleteActiveFile}
                      className="h-7 w-7 rounded-lg hover:bg-white/5 text-destructive/80 hover:text-destructive" 
                      title="Delete File"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setShowExplorer(false)}
                    className="h-7 w-7 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground ml-1"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {isCreatingFile && (
                <form onSubmit={handleCreateFileSubmit} className="p-2.5 border-b border-border/10 bg-[#121317]">
                  <input
                    type="text"
                    autoFocus
                    value={newFileName}
                    onChange={e => setNewFileName(e.target.value)}
                    placeholder="components/Header.tsx"
                    className="w-full bg-[#090a0d] border border-border/20 rounded px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/50"
                  />
                  <div className="flex justify-end gap-1.5 mt-2">
                    <Button 
                      type="button" 
                      size="sm" 
                      variant="ghost" 
                      onClick={() => setIsCreatingFile(false)}
                      className="h-6 px-2 text-[11px]"
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="submit" 
                      size="sm" 
                      className="h-6 px-2.5 text-[11px]"
                    >
                      Create
                    </Button>
                  </div>
                </form>
              )}

              <div className="flex-1 min-h-0 overflow-y-auto">
                <FileExplorer 
                  files={files} 
                  selectedFile={selectedFile} 
                  onSelectFile={(path) => {
                    setSelectedFile(path);
                    setShowExplorer(false);
                  }} 
                />
              </div>
            </div>
            <div className="flex-1" onClick={() => setShowExplorer(false)} />
          </div>
        )
      ) : (
        /* Desktop Sidebar */
        showExplorer && (
          <div className="w-56 border-r border-border/10 flex flex-col shrink-0 bg-[#0d0e10]">
            <div className="px-3 py-2 border-b border-border/10 flex items-center justify-between">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Workspace</span>
              <div className="flex gap-1">
                <Button 
                  size="icon" 
                  variant="ghost" 
                  onClick={() => setIsCreatingFile(prev => !prev)}
                  className="h-5 w-5 rounded hover:bg-white/5" 
                  title="Create File"
                >
                  <Plus className="h-3 w-3 text-muted-foreground" />
                </Button>
                {selectedFile && (
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    onClick={handleDeleteActiveFile}
                    className="h-5 w-5 rounded hover:bg-white/5 text-destructive/80 hover:text-destructive" 
                    title="Delete File"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
            
            {isCreatingFile && (
              <form onSubmit={handleCreateFileSubmit} className="p-2 border-b border-border/10">
                <input
                  type="text"
                  autoFocus
                  value={newFileName}
                  onChange={e => setNewFileName(e.target.value)}
                  placeholder="components/Header.tsx"
                  className="w-full bg-[#121316] border border-border/20 rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary/50"
                />
                <div className="flex justify-end gap-1.5 mt-1.5">
                  <Button 
                    type="button" 
                    size="sm" 
                    variant="ghost" 
                    onClick={() => setIsCreatingFile(false)}
                    className="h-6 px-2 text-[10px]"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    size="sm" 
                    className="h-6 px-2 text-[10px]"
                  >
                    Create
                  </Button>
                </div>
              </form>
            )}

            <div className="flex-1 min-h-0">
              <FileExplorer 
                files={files} 
                selectedFile={selectedFile} 
                onSelectFile={setSelectedFile} 
              />
            </div>
          </div>
        )
      )}

      {/* Editor & Tabs Container */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#0c0d0e]">
        {/* Tab bar header */}
        <div className="h-9 border-b border-border/10 bg-[#0d0e10] flex items-center justify-between px-2 overflow-x-auto shrink-0 select-none">
          <div className="flex items-center gap-1.5 min-w-0">
            <Button 
              size="sm" 
              variant="ghost" 
              onClick={() => setShowExplorer(prev => !prev)}
              className={cn(
                "rounded hover:bg-white/5 shrink-0 gap-1.5 text-xs text-muted-foreground hover:text-foreground",
                isMobile ? "h-7 px-2" : "h-6 w-6 p-0"
              )}
              title="Toggle file explorer"
            >
              {isMobile ? (
                <>
                  <Folder className="h-3.5 w-3.5 text-primary" />
                  <span className="text-[11px] font-medium">Files</span>
                </>
              ) : (
                showExplorer ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeft className="h-3.5 w-3.5" />
              )}
            </Button>
            <div className="flex gap-1 overflow-x-auto min-w-0">
              {openTabs.map(tab => {
                const isSelected = selectedFile === tab;
                const fileName = tab.split('/').pop() || tab;
                return (
                  <div
                    key={tab}
                    onClick={() => setSelectedFile(tab)}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-t-md border-t-2 border-x border-transparent cursor-pointer transition-colors max-w-[120px] truncate shrink-0",
                      isSelected 
                        ? "bg-[#0c0d0e] border-t-primary border-x-border/10 text-foreground font-medium" 
                        : "text-muted-foreground hover:text-foreground bg-transparent"
                    )}
                  >
                    <span className="truncate">{fileName}</span>
                    <X 
                      className="h-3 w-3 hover:bg-white/10 rounded-full p-0.5 shrink-0" 
                      onClick={(e) => closeTab(tab, e)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Monaco Editor area */}
        <div className="flex-1 min-h-0">
          {!selectedFile ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6">
              <p className="text-sm text-muted-foreground">Select a file from the explorer sidebar to view code</p>
            </div>
          ) : !currentFile ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6">
              <p className="text-sm text-muted-foreground">File not found</p>
            </div>
          ) : (
            <Editor
              height="100%"
              language={language}
              value={currentFile.content}
              onChange={handleChange}
              onMount={handleEditorMount}
              theme="vs-dark"
              loading={
                <div className="h-full flex items-center justify-center bg-[#0c0d0e]">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              }
              options={{
                fontSize: isMobile ? 12 : 13,
                fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
                fontLigatures: true,
                lineHeight: 1.6,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                tabSize: 2,
                padding: { top: isMobile ? 8 : 12 },
                smoothScrolling: true,
                cursorBlinking: 'smooth',
                cursorSmoothCaretAnimation: 'on',
                renderLineHighlight: 'all',
                lineNumbers: 'on',
                lineNumbersMinChars: isMobile ? 3 : 4,
                glyphMargin: false,
                folding: !isMobile,
                bracketPairColorization: { enabled: true },
                automaticLayout: true,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
