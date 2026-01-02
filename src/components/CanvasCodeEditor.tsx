import { useCallback, useRef, useState, useEffect } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '@/lib/utils';

interface CanvasCodeEditorProps {
  code: string;
  language: string;
  onChange: (code: string) => void;
  readOnly?: boolean;
  className?: string;
}

// Map common language names to syntax highlighter language keys
function normalizeLanguage(lang: string): string {
  const langMap: Record<string, string> = {
    'js': 'javascript',
    'ts': 'typescript',
    'tsx': 'tsx',
    'jsx': 'jsx',
    'py': 'python',
    'rb': 'ruby',
    'rs': 'rust',
    'go': 'go',
    'sh': 'bash',
    'shell': 'bash',
    'yml': 'yaml',
    'md': 'markdown',
    'html': 'html',
    'css': 'css',
    'json': 'json',
    'sql': 'sql',
    'graphql': 'graphql',
    'swift': 'swift',
    'kotlin': 'kotlin',
    'java': 'java',
    'c': 'c',
    'cpp': 'cpp',
    'csharp': 'csharp',
    'cs': 'csharp',
    'php': 'php',
    'vue': 'javascript',
    'svelte': 'javascript',
  };
  return langMap[lang.toLowerCase()] || lang.toLowerCase();
}

export function CanvasCodeEditor({ 
  code, 
  language, 
  onChange, 
  readOnly = false,
  className 
}: CanvasCodeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  
  // Check if dark mode (always dark in this app, but let's be safe)
  const [isDark, setIsDark] = useState(true);
  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
  }, []);
  
  const normalizedLang = normalizeLanguage(language);

  // Sync scroll between textarea and syntax highlighter
  const handleScroll = useCallback((e: React.UIEvent<HTMLTextAreaElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Handle tab key for indentation
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      
      const newValue = code.substring(0, start) + '  ' + code.substring(end);
      onChange(newValue);
      
      // Set cursor position after indent
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      });
    }
  }, [code, onChange]);

  // Generate line numbers
  const lineNumbers = code.split('\n').map((_, i) => i + 1);

  return (
    <div className={cn("relative flex h-full font-mono text-sm", className)}>
      {/* Line numbers */}
      <div 
        className="flex-shrink-0 w-12 bg-muted/30 border-r border-border/30 select-none overflow-hidden"
        style={{ paddingTop: 16 }}
      >
        <div 
          className="flex flex-col items-end pr-3 text-muted-foreground/50"
          style={{ transform: `translateY(-${scrollTop}px)` }}
        >
          {lineNumbers.map((num) => (
            <div key={num} className="h-6 leading-6 text-xs">
              {num}
            </div>
          ))}
        </div>
      </div>

      {/* Code area with overlay */}
      <div className="flex-1 relative overflow-hidden">
        {/* Syntax highlighted background */}
        <div 
          ref={scrollRef}
          className="absolute inset-0 overflow-hidden pointer-events-none p-4"
          style={{ transform: `translateY(-${scrollTop}px)` }}
        >
          <SyntaxHighlighter
            language={normalizedLang}
            style={isDark ? oneDark : oneLight}
            customStyle={{
              margin: 0,
              padding: 0,
              background: 'transparent',
              fontSize: '0.875rem',
              lineHeight: '1.5rem',
            }}
            codeTagProps={{
              style: {
                fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
              }
            }}
          >
            {code || ' '}
          </SyntaxHighlighter>
        </div>

        {/* Editable textarea overlay */}
        <textarea
          ref={textareaRef}
          value={code}
          onChange={(e) => onChange(e.target.value)}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          readOnly={readOnly}
          spellCheck={false}
          className={cn(
            "absolute inset-0 w-full h-full p-4 resize-none",
            "bg-transparent text-transparent caret-foreground",
            "focus:outline-none focus:ring-0",
            "font-mono text-sm leading-6",
            readOnly && "cursor-default"
          )}
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
          }}
        />
      </div>
    </div>
  );
}
