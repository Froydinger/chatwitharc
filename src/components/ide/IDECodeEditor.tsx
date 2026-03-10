import { useRef } from 'react';
import Editor, { type OnChange, type OnMount } from '@monaco-editor/react';
import type { VirtualFileSystem } from '@/types/ide';
import { getLanguageFromPath } from '@/lib/file-tree';
import { Loader2 } from 'lucide-react';

interface IDECodeEditorProps {
  files: VirtualFileSystem;
  selectedFile: string | null;
  onFileChange: (path: string, content: string) => void;
}

export function IDECodeEditor({ files, selectedFile, onFileChange }: IDECodeEditorProps) {
  const editorRef = useRef<any>(null);

  const handleEditorMount: OnMount = (editor) => { editorRef.current = editor; };
  const handleChange: OnChange = (value) => {
    if (selectedFile && value !== undefined) onFileChange(selectedFile, value);
  };

  const currentFile = selectedFile ? files[selectedFile] : null;
  const language = selectedFile ? getLanguageFromPath(selectedFile) : 'typescript';

  if (!selectedFile || !currentFile) {
    return (
      <div className="h-full flex items-center justify-center bg-background/30">
        <p className="text-sm text-muted-foreground">Select a file to edit</p>
      </div>
    );
  }

  return (
    <Editor
      height="100%"
      language={language}
      value={currentFile.content}
      onChange={handleChange}
      onMount={handleEditorMount}
      theme="vs-dark"
      loading={
        <div className="h-full flex items-center justify-center bg-background/30">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      }
      options={{
        fontSize: 13,
        fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
        fontLigatures: true,
        lineHeight: 1.6,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        tabSize: 2,
        padding: { top: 12 },
        smoothScrolling: true,
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on',
        renderLineHighlight: 'all',
        lineNumbers: 'on',
        lineNumbersMinChars: 4,
        glyphMargin: false,
        folding: true,
        bracketPairColorization: { enabled: true },
        automaticLayout: true,
      }}
    />
  );
}
