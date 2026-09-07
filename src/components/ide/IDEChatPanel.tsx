import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Sparkles, ArrowLeft, Terminal, Bot, CornerDownLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ThemedLogo } from '@/components/ThemedLogo';
import { AgentTimeline } from './AgentTimeline';
import { cn } from '@/lib/utils';
import type { AgentAction } from '@/types/ide';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  agentActions?: AgentAction[];
}

interface IDEChatPanelProps {
  messages: ChatMessage[];
  liveActions: AgentAction[];
  isLoading: boolean;
  generatingId: string | null;
  onSend: (message: string) => void;
  onGoHome?: () => void;
  syncStatus?: 'saved' | 'saving' | 'unsaved' | 'error';
}

const QUICK_PROMPTS = [
  'Add dark mode with toggle switch',
  'Add user profile edit & avatar upload',
  'Make the interface fully responsive on mobile',
  'Add search filtering and tag categories'
];

export function IDEChatPanel({ 
  messages, 
  liveActions, 
  isLoading, 
  generatingId, 
  onSend,
  onGoHome,
  syncStatus = 'saved'
}: IDEChatPanelProps) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, liveActions]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;
    onSend(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#0b0c0e] border-r border-border/10">
      {/* Assistant Header */}
      <div className="px-4 py-3 border-b border-border/10 flex items-center justify-between shrink-0 bg-[#0d0e12]/80 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          {onGoHome && (
            <Button 
              size="icon" 
              variant="ghost" 
              onClick={onGoHome}
              className="h-7 w-7 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground"
              title="Dashboard"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="w-6 h-6 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center p-1">
            <ThemedLogo className="w-full h-full object-contain" />
          </div>
          <div>
            <h2 className="font-semibold text-xs leading-none flex items-center gap-1.5 text-foreground">
              <span>Arc Agent</span>
              <span className="text-[8.5px] bg-primary/15 text-primary px-1.5 py-0.2 rounded font-mono font-medium tracking-wider">LUNA</span>
            </h2>
            <p className="text-[9.5px] text-muted-foreground mt-0.5">
              {syncStatus === 'saving' && 'Saving changes…'}
              {syncStatus === 'saved' && 'All files saved'}
              {syncStatus === 'unsaved' && 'Unsaved edits'}
              {syncStatus === 'error' && 'Sync error'}
            </p>
          </div>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <ScrollArea ref={scrollRef} className="flex-1 p-4">
        <div className="space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-10 space-y-5">
              <div className="relative inline-flex items-center justify-center">
                <div className="absolute -inset-2 rounded-2xl bg-primary/20 blur-md" />
                <div className="relative p-3 rounded-2xl bg-background/80 border border-white/10 text-primary">
                  <Sparkles className="h-6 w-6" />
                </div>
              </div>
              <div className="space-y-1.5">
                <h3 className="font-semibold text-sm text-foreground">Build with Arc Studio</h3>
                <p className="text-xs text-muted-foreground max-w-[240px] mx-auto leading-relaxed">
                  Describe what you want to build or pick a prompt below to get started.
                </p>
              </div>
              <div className="flex flex-col gap-1.5 max-w-[290px] mx-auto pt-1">
                {[
                  'Create a notes app with tags and local persistence',
                  'Build an expense tracker dashboard with charts',
                  'Create a clean Kanban board with drag & drop'
                ].map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setInput(s);
                    }}
                    className="px-3.5 py-2 text-xs text-left bg-[#12141a] border border-white/5 hover:border-primary/30 hover:bg-primary/5 rounded-xl text-muted-foreground hover:text-foreground transition-all duration-200 shadow-sm"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => {
            const isCurrentlyGenerating = message.id === generatingId && isLoading;

            return (
              <div 
                key={message.id} 
                className={cn(
                  'flex flex-col gap-1 max-w-[92%]', 
                  message.role === 'user' ? 'ml-auto items-end' : 'mr-auto items-start'
                )}
              >
                <div className="flex items-center gap-1.5 px-1">
                  {message.role === 'assistant' && (
                    <div className="w-3.5 h-3.5 rounded-full bg-primary/20 flex items-center justify-center p-0.5">
                      <ThemedLogo className="w-full h-full object-contain" />
                    </div>
                  )}
                  <span className="text-[10px] text-muted-foreground/60 font-medium">
                    {message.role === 'user' ? 'You' : 'Arc Agent'}
                  </span>
                </div>

                <div 
                  className={cn(
                    'rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-sm transition-all',
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-tr-sm'
                      : 'bg-[#12141b] border border-white/10 text-foreground rounded-tl-sm'
                  )}
                >
                  {isCurrentlyGenerating ? (
                    <AgentTimeline actions={liveActions} isRunning={true} />
                  ) : message.role === 'assistant' && message.agentActions && message.agentActions.length > 0 ? (
                    <div className="space-y-3">
                      <AgentTimeline actions={message.agentActions} isRunning={false} />
                      {message.content && (
                        <p className="text-xs text-foreground/90 pt-2 border-t border-border/10 leading-relaxed whitespace-pre-wrap">
                          {message.content}
                        </p>
                      )}
                    </div>
                  ) : !message.content && message.role === 'assistant' ? (
                    <span className="text-muted-foreground">App generation complete! Look at the live preview.</span>
                  ) : (
                    <span className="whitespace-pre-wrap">{message.content}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Quick Suggestion Chips when idle */}
      {messages.length > 0 && !isLoading && (
        <div className="px-4 py-1.5 overflow-x-auto flex items-center gap-1.5 no-scrollbar border-t border-white/5 bg-[#0d0e12]/60">
          {QUICK_PROMPTS.map((chip) => (
            <button
              key={chip}
              onClick={() => onSend(chip)}
              className="text-[10px] whitespace-nowrap px-2.5 py-1 rounded-full bg-white/5 hover:bg-primary/15 border border-white/5 hover:border-primary/30 text-muted-foreground hover:text-foreground transition-all shrink-0"
            >
              + {chip}
            </button>
          ))}
        </div>
      )}

      {/* Prompt input area */}
      <div className="p-3 border-t border-border/10 bg-[#0d0e12]/90 backdrop-blur-md shrink-0">
        <form onSubmit={handleSubmit} className="relative flex items-end bg-[#13151c] border border-white/10 rounded-xl p-2 focus-within:border-primary/45 transition-colors shadow-inner">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Arc to change something..."
            rows={1}
            className="flex-1 min-h-[38px] max-h-28 resize-none text-xs bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-2 py-2 text-foreground placeholder:text-muted-foreground/60"
            disabled={isLoading}
          />
          <Button 
            type="submit" 
            size="icon" 
            disabled={!input.trim() || isLoading}
            className="h-8 w-8 rounded-lg shrink-0 transition-all"
          >
            {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </Button>
        </form>
      </div>
    </div>
  );
}
