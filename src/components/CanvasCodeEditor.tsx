import { useCallback, useRef, useMemo, useState, useEffect } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '@/lib/utils';
import { normalizeLanguage } from '@/utils/codeUtils';

interface CanvasCodeEditorProps {
  code: string;
  language: string;
  onChange: (code: string) => void;
  readOnly?: boolean;
  className?: string;
}

// Memoized syntax highlighter to prevent re-renders on scroll
const MemoizedHighlighter = ({ 
  code, 
  language, 
  isDark 
}: { 
  code: string; 
  language: string; 
  isDark: boolean;
}) => {
  const normalizedLang = normalizeLanguage(language);
  
  return (
    <SyntaxHighlighter
      language={normalizedLang}
      style={isDark ? vscDarkPlus : vs}
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
  );
};

export function CanvasCodeEditor({ 
  code, 
  language, 
  onChange, 
  readOnly = false,
  className 
}: CanvasCodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const highlighterRef = useRef<HTMLDivElement>(null);
  
  // Check if dark mode
  const [isDark, setIsDark] = useState(true);
  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
  }, []);

  // Memoize syntax highlighted output - only re-render when code or language changes
  const highlightedCode = useMemo(() => (
    <MemoizedHighlighter code={code} language={language} isDark={isDark} />
  ), [code, language, isDark]);

  // Generate line numbers
  const lineNumbers = useMemo(() => {
    return code.split('\n').map((_, i) => i + 1);
  }, [code]);

  // Sync scroll between all three elements using native scroll
  const handleScroll = useCallback((e: React.UIEvent<HTMLTextAreaElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    const scrollLeft = e.currentTarget.scrollLeft;
    
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = scrollTop;
    }
    if (highlighterRef.current) {
      highlighterRef.current.scrollTop = scrollTop;
      highlighterRef.current.scrollLeft = scrollLeft;
    }
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

  return (
    <div 
      ref={containerRef}
      className={cn("relative flex h-full font-mono text-sm overflow-hidden", className)}
    >
      {/* Line numbers - scroll synced */}
      <div 
        ref={lineNumbersRef}
        className="flex-shrink-0 w-12 bg-muted/30 border-r border-border/30 select-none overflow-hidden"
      >
        <div 
          className="flex flex-col items-end pr-3 pt-4"
          style={{ minHeight: `${lineNumbers.length * 24 + 32}px` }}
        >
          {lineNumbers.map((num) => (
            <div key={num} className="h-6 leading-6 text-xs text-muted-foreground/50">
              {num}
            </div>
          ))}
        </div>
      </div>

      {/* Code area with overlay */}
      <div className="flex-1 relative overflow-hidden">
        {/* Syntax highlighted background - scroll synced */}
        <div 
          ref={highlighterRef}
          className="absolute inset-0 overflow-hidden pointer-events-none p-4"
          style={{ willChange: 'scroll-position' }}
        >
          <div style={{ minHeight: `${lineNumbers.length * 24 + 32}px` }}>
            {highlightedCode}
          </div>
        </div>

        {/* Editable textarea overlay - this is the main scroll driver */}
        <textarea
          ref={textareaRef}
          value={code}
          onChange={(e) => onChange(e.target.value)}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          readOnly={readOnly}
          spellCheck={false}
          className={cn(
            "absolute inset-0 w-full h-full p-4 resize-none overflow-auto",
            "bg-transparent text-transparent caret-foreground",
            "focus:outline-none focus:ring-0",
            "font-mono text-sm leading-6",
            readOnly && "cursor-default"
          )}
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
            caretColor: 'currentColor',
          }}
        />
      </div>
    </div>
  );
}
