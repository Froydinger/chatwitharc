import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, User, Sparkles } from 'lucide-react';
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
}

export function IDEChatPanel({ messages, liveActions, isLoading, generatingId, onSend }: IDEChatPanelProps) {
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
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/30 flex items-center gap-3 shrink-0">
        <div className="relative">
          <ThemedLogo className="rounded-lg w-7 h-7" />
        </div>
        <div className="flex-1">
          <h2 className="font-semibold text-sm leading-none">Arc Builder</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">Agentic Code Generation</p>
        </div>
        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-primary/10 text-primary">
          <Sparkles className="h-3 w-3" />
          <span className="text-[10px] font-medium">Agentic</span>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea ref={scrollRef} className="flex-1 p-4 [&>div>div]:!block">
        <div className="space-y-3 w-full overflow-hidden">
          {messages.length === 0 && (
            <div className="text-center py-10 space-y-4 animate-fade-in">
              <ThemedLogo className="mx-auto rounded-2xl w-14 h-14" />
              <div>
                <h3 className="font-semibold">What are we building?</h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-[240px] mx-auto leading-relaxed">
                  Describe your app and I'll plan, create, and modify files step by step.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5 justify-center pt-2">
                {['Build a todo app', 'Weather dashboard', 'Portfolio site'].map((s) => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    className="px-3 py-1 text-xs bg-secondary/60 hover:bg-secondary rounded-full text-muted-foreground hover:text-foreground transition-colors"
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
              <div key={message.id} className={cn('flex gap-2.5 overflow-hidden', message.role === 'user' ? 'flex-row-reverse' : '')}>
                {message.role === 'user' ? (
                  <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5 bg-secondary">
                    <User className="h-3 w-3 text-muted-foreground" />
                  </div>
                ) : (
                  <ThemedLogo size={24} className="rounded-md shrink-0 mt-0.5" />
                )}
                <div className="flex flex-col gap-1 min-w-0 flex-1 overflow-hidden">
                  <div className={cn(
                    'rounded-2xl px-3.5 py-2.5 text-sm max-w-full break-words',
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground ml-auto'
                      : 'bg-secondary/50'
                  )}>
                    {isCurrentlyGenerating ? (
                      <AgentTimeline actions={liveActions} isRunning={true} />
                    ) : message.role === 'assistant' && message.agentActions && message.agentActions.length > 0 ? (
                      <div className="space-y-2">
                        <AgentTimeline actions={message.agentActions} isRunning={false} />
                        {message.content && (
                          <p className="text-xs text-foreground pt-1 border-t border-border/20">
                            {message.content}
                          </p>
                        )}
                      </div>
                    ) : !message.content && message.role === 'assistant' ? (
                      <span className="text-xs text-muted-foreground">Done! Check the Preview tab.</span>
                    ) : (
                      <span className="whitespace-pre-wrap">{message.content}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-3 border-t border-border/30 shrink-0">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe what to build or change…"
            className="min-h-[40px] max-h-28 resize-none text-sm bg-secondary/30 border-border/40 
                     focus:border-primary/40 focus:ring-1 focus:ring-primary/15"
            disabled={isLoading}
          />
          <Button type="submit" size="icon" disabled={!input.trim() || isLoading}
            className="h-10 w-10 shrink-0">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </div>
    </div>
  );
}
