import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Sparkles, Home, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
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
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/10 flex items-center justify-between shrink-0 bg-[#0d0e10]">
        <div className="flex items-center gap-2.5">
          {onGoHome && (
            <Button 
              size="icon" 
              variant="ghost" 
              onClick={onGoHome}
              className="h-7 w-7 rounded-md hover:bg-white/5"
              title="Dashboard"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div>
            <h2 className="font-semibold text-sm leading-none flex items-center gap-1.5">
              <span>Arc Code</span>
              <span className="text-[9px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-mono font-bold tracking-wider">AGENT</span>
            </h2>
            <p className="text-[10px] text-muted-foreground mt-1">
              {syncStatus === 'saving' && 'Saving changes…'}
              {syncStatus === 'saved' && 'All changes saved'}
              {syncStatus === 'unsaved' && 'Unsaved edits'}
              {syncStatus === 'error' && 'Sync error'}
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea ref={scrollRef} className="flex-1 p-4">
        <div className="space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-12 space-y-6">
              <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-primary/10 text-primary">
                <Sparkles className="h-6 w-6" />
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold text-sm">Create a new web application</h3>
                <p className="text-xs text-muted-foreground max-w-[240px] mx-auto leading-relaxed">
                  Describe the app you want to build and I'll code it from scratch.
                </p>
              </div>
              <div className="flex flex-col gap-2 max-w-[280px] mx-auto pt-2">
                {[
                  'create a basic notes app inspired by apple notes',
                  'build a budget tracker dashboard with localStorage',
                  'create a clean kanban card board'
                ].map((s) => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    className="px-4 py-2.5 text-xs text-left bg-[#121316] border border-border/10 hover:border-border/30 rounded-xl text-muted-foreground hover:text-foreground transition-all duration-200"
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
                  'flex flex-col gap-1 max-w-[90%]', 
                  message.role === 'user' ? 'ml-auto' : 'mr-auto'
                )}
              >
                <span className="text-[10px] text-muted-foreground/60 px-1">
                  {message.role === 'user' ? 'You' : 'Arc Agent'}
                </span>
                <div 
                  className={cn(
                    'rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-sm',
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-[#121316] border border-border/10 text-foreground'
                  )}
                >
                  {isCurrentlyGenerating ? (
                    <AgentTimeline actions={liveActions} isRunning={true} />
                  ) : message.role === 'assistant' && message.agentActions && message.agentActions.length > 0 ? (
                    <div className="space-y-3">
                      <AgentTimeline actions={message.agentActions} isRunning={false} />
                      {message.content && (
                        <p className="text-xs text-foreground/90 pt-2 border-t border-border/10">
                          {message.content}
                        </p>
                      )}
                    </div>
                  ) : !message.content && message.role === 'assistant' ? (
                    <span className="text-muted-foreground">App generation complete! Look at the preview.</span>
                  ) : (
                    <span className="whitespace-pre-wrap">{message.content}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Prompt input area */}
      <div className="p-4 border-t border-border/10 bg-[#0d0e10] shrink-0">
        <form onSubmit={handleSubmit} className="relative flex items-end bg-[#121316] border border-border/10 rounded-xl p-2 focus-within:border-primary/45 transition-colors">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Arc to change styling, add pages, or fix errors…"
            className="flex-1 min-h-[44px] max-h-28 resize-none text-xs bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-2 py-2"
            disabled={isLoading}
          />
          <Button 
            type="submit" 
            size="icon" 
            disabled={!input.trim() || isLoading}
            className="h-8 w-8 rounded-lg shrink-0"
          >
            {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </Button>
        </form>
      </div>
    </div>
  );
}
