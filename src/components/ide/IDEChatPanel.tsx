import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Sparkles, Terminal, Bot, CornerDownLeft, Plus, X, Image as ImageIcon, Smartphone, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ThemedLogo } from '@/components/ThemedLogo';
import { AgentTimeline } from './AgentTimeline';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import type { AgentAction } from '@/types/ide';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  images?: string[];
  timestamp: number;
  agentActions?: AgentAction[];
}

interface IDEChatPanelProps {
  messages: ChatMessage[];
  liveActions: AgentAction[];
  isLoading: boolean;
  generatingId: string | null;
  onSend: (message: string, images?: string[]) => void;
  onSelectFile?: (path: string) => void;
  syncStatus?: 'saved' | 'saving' | 'unsaved' | 'error';
  onViewPreview?: () => void;
}

const QUICK_PROMPTS = [
  'Let users create accounts & log in',
  'Add persistent database storage',
  'Add dark mode with toggle switch',
  'Make the interface fully responsive on mobile',
  'Add search filtering and categories'
];

export function IDEChatPanel({ 
  messages, 
  liveActions, 
  isLoading, 
  generatingId, 
  onSend,
  onSelectFile,
  syncStatus = 'saved',
  onViewPreview
}: IDEChatPanelProps) {
  const [input, setInput] = useState('');
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, liveActions, attachedImages]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploadingImage(true);
    try {
      for (const file of files) {
        if (!file.type.startsWith('image/')) continue;

        // Immediate preview via dataUrl
        const reader = new FileReader();
        const dataUrlPromise = new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        const dataUrl = await dataUrlPromise;

        // Attempt Supabase storage upload for permanent public URL
        let finalUrl = dataUrl;
        try {
          const { data: { user } } = await supabase.auth.getUser();
          const userId = user?.id || 'anonymous';
          const ext = file.name.split('.').pop() || 'png';
          const path = `${userId}/ide-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

          const { error: uploadErr } = await supabase.storage.from('avatars').upload(path, file, {
            contentType: file.type,
            upsert: true,
          });

          if (!uploadErr) {
            const { data: pubData } = supabase.storage.from('avatars').getPublicUrl(path);
            if (pubData?.publicUrl) {
              finalUrl = pubData.publicUrl;
            }
          }
        } catch (err) {
          console.warn('[IDE] Storage upload fallback to data URL:', err);
        }

        setAttachedImages((prev) => [...prev, finalUrl]);
      }
    } catch (err) {
      console.error('[IDE] Error attaching image:', err);
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imageItems = items.filter((item) => item.type.startsWith('image/'));
    if (imageItems.length === 0) return;

    e.preventDefault();
    setUploadingImage(true);
    try {
      for (const item of imageItems) {
        const file = item.getAsFile();
        if (!file) continue;

        const reader = new FileReader();
        const dataUrlPromise = new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        const dataUrl = await dataUrlPromise;

        let finalUrl = dataUrl;
        try {
          const { data: { user } } = await supabase.auth.getUser();
          const userId = user?.id || 'anonymous';
          const path = `${userId}/ide-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;

          const { error: uploadErr } = await supabase.storage.from('avatars').upload(path, file, {
            contentType: file.type,
            upsert: true,
          });

          if (!uploadErr) {
            const { data: pubData } = supabase.storage.from('avatars').getPublicUrl(path);
            if (pubData?.publicUrl) {
              finalUrl = pubData.publicUrl;
            }
          }
        } catch (err) {
          console.warn('[IDE] Paste storage fallback to data URL:', err);
        }

        setAttachedImages((prev) => [...prev, finalUrl]);
      }
    } catch (err) {
      console.error('[IDE] Error pasting image:', err);
    } finally {
      setUploadingImage(false);
    }
  };

  const removeAttachedImage = (index: number) => {
    setAttachedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!input.trim() && attachedImages.length === 0) || isLoading || uploadingImage) return;
    onSend(input.trim(), attachedImages.length > 0 ? attachedImages : undefined);
    setInput('');
    setAttachedImages([]);
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
                  {message.images && message.images.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {message.images.map((img, idx) => (
                        <a 
                          key={idx} 
                          href={img} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="block relative group overflow-hidden rounded-xl border border-white/20 hover:border-white/40 transition-colors bg-black/20"
                        >
                          <img src={img} alt="Attachment" className="w-20 h-20 object-cover rounded-xl transition-transform duration-200 group-hover:scale-105" />
                        </a>
                      ))}
                    </div>
                  )}

                  {isCurrentlyGenerating ? (
                    <div className="space-y-2.5">
                      {message.content && (
                        <div className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap">
                          {message.content}
                        </div>
                      )}
                      <AgentTimeline actions={liveActions} isRunning={true} onSelectFile={onSelectFile} />
                    </div>
                  ) : message.role === 'assistant' ? (
                    <div className="space-y-2.5">
                      {message.content && (
                        <div className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap">
                          {message.content}
                        </div>
                      )}
                      {message.agentActions && message.agentActions.length > 0 && (
                        <AgentTimeline actions={message.agentActions} isRunning={false} onSelectFile={onSelectFile} />
                      )}
                      {!message.content && (!message.agentActions || message.agentActions.length === 0) && (
                        <span className="text-muted-foreground">Ready to build! Describe what you'd like to create or change.</span>
                      )}
                      {onViewPreview && (
                        <div className="pt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={onViewPreview}
                            className="h-7 px-3 text-[11px] rounded-xl border-primary/30 bg-primary/10 hover:bg-primary/20 text-primary font-medium gap-1.5 shadow-sm transition-all"
                          >
                            <Smartphone className="h-3 w-3" />
                            <span>View Live Preview</span>
                            <ArrowRight className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
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
        {/* Attached image preview tray */}
        {(attachedImages.length > 0 || uploadingImage) && (
          <div className="flex items-center gap-2 px-1 pb-2.5 overflow-x-auto no-scrollbar">
            {attachedImages.map((url, idx) => (
              <div key={idx} className="relative group shrink-0 w-14 h-14 rounded-xl overflow-hidden border border-white/15 bg-black/40 shadow-md">
                <img src={url} alt="Attached" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeAttachedImage(idx)}
                  className="absolute top-1 right-1 w-4 h-4 rounded-full bg-black/80 hover:bg-black text-white flex items-center justify-center transition-colors shadow-sm"
                  title="Remove image"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
            {uploadingImage && (
              <div className="w-14 h-14 rounded-xl border border-dashed border-white/20 bg-white/5 flex flex-col items-center justify-center shrink-0 gap-1">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span className="text-[9px] text-muted-foreground">Uploading</span>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="relative flex items-center gap-2 bg-[#13151c]/90 border border-white/10 rounded-full px-2.5 py-1.5 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all shadow-inner">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || uploadingImage}
            className="flex items-center justify-center w-8 h-8 rounded-full transition-all hover:bg-white/10 active:scale-95 text-muted-foreground hover:text-foreground shrink-0"
            title="Attach image or screenshot"
          >
            <Plus className="h-4 w-4" />
          </button>

          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={isLoading ? "Luna is thinking..." : "Message Arc Studio..."}
            rows={1}
            className="flex-1 min-h-[28px] max-h-32 resize-none text-[15px] sm:text-xs bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-2 py-1 text-foreground placeholder:text-muted-foreground/60 scrollbar-hide"
            disabled={isLoading}
          />

          <Button 
            type="submit" 
            size="icon" 
            disabled={(!input.trim() && attachedImages.length === 0) || isLoading || uploadingImage}
            className={cn(
              "h-7 w-7 rounded-full shrink-0 transition-all",
              input.trim() || attachedImages.length > 0
                ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                : "bg-white/5 text-muted-foreground/40 hover:bg-white/10"
            )}
          >
            {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3 w-3" />}
          </Button>
        </form>
      </div>
    </div>
  );
}
