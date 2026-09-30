import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, X, Trash2, Send, GripVertical, Pencil, Check, RotateCcw, ChevronDown, ChevronUp, ListOrdered } from 'lucide-react';
import { useMessageQueueStore, QueuedMessage } from '@/store/useMessageQueueStore';
import { cn } from '@/lib/utils';
import { useArcStore } from '@/store/useArcStore';
import { useAuth } from '@/hooks/useAuth';

interface MessageQueueProps {
  onSendMessage: (request: QueuedMessage) => void;
  onRetryRequest: (request: QueuedMessage) => void;
  isLoading: boolean;
  isDashboard?: boolean;
  executionMode: 'ask' | 'auto';
}

export function MessageQueue(props: MessageQueueProps) {
  const currentSessionId = useArcStore(state => state.currentSessionId);
  const { user } = useAuth();
  return <MessageQueueView {...props} ownerId={user?.id ?? null} currentSessionId={currentSessionId} />;
}

export function MessageQueueView({ onSendMessage, onRetryRequest, isLoading, isDashboard, executionMode, ownerId, currentSessionId }: MessageQueueProps & { ownerId: string | null; currentSessionId: string | null }) {
  const { queue: allQueue, failed: allFailed, dismissFailure, isPaused, isOpen, removeFromQueue, editInQueue, clearQueue, togglePause } = useMessageQueueStore();
  const queue = allQueue.filter(request => request.ownerId === ownerId);
  const failed = allFailed.filter(item => item.request.ownerId === ownerId);
  const canSend = !!queue[0] && queue[0].sessionId === currentSessionId && queue[0].executionMode === executionMode;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [collapsed, setCollapsed] = useState(false);

  if (!isOpen || (queue.length === 0 && failed.length === 0)) return null;

  const handleSendNext = () => {
    if (isLoading || isPaused || !canSend) return;
    onSendMessage(queue[0]);
  };

  const handleSendAll = () => {
    if (isLoading || isPaused || !canSend) return;
    onSendMessage(queue[0]);
    // Subsequent messages will be sent via the auto-send effect in ChatInput
  };

  const startEdit = (msg: QueuedMessage) => {
    setEditingId(msg.id);
    setEditValue(msg.content);
  };

  const saveEdit = () => {
    if (editingId && editValue.trim()) {
      editInQueue(editingId, editValue.trim());
    }
    setEditingId(null);
    setEditValue('');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.97 }}
      transition={{ type: 'spring', damping: 28, stiffness: 500 }}
      className={cn(
        "w-full rounded-2xl border backdrop-blur-xl overflow-hidden",
        isDashboard
          ? "bg-black/80 border-white/10 shadow-[0_8px_32px_rgba(0,0,0,.5)]"
          : "bg-background/90 border-border/40 shadow-xl"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/20">
        <div className="flex items-center gap-2">
          <ListOrdered className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-medium text-foreground/80">
            {failed.length > 0 && queue.length === 0 ? "Retry" : "Queue"} ({queue.length + failed.length})
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={togglePause}
            className={cn(
              "h-6 w-6 rounded-full flex items-center justify-center transition-colors text-xs",
              isPaused
                ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
                : "bg-primary/10 text-primary hover:bg-primary/20"
            )}
            title={isPaused ? 'Resume queue' : 'Pause queue'}
          >
            {isPaused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
          </button>
          <button
            onClick={handleSendNext}
            disabled={isLoading || isPaused || !canSend}
            className="h-6 px-2 rounded-full flex items-center gap-1 bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-[10px] font-medium disabled:opacity-40"
            title="Send next message"
          >
            <Send className="h-2.5 w-2.5" />
            Next
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            {collapsed ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          <button
            onClick={clearQueue}
            className="h-6 w-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
            title="Clear queue"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {queue.length > 0 && !canSend && <p className="px-3 py-2 text-xs text-muted-foreground">Open the original chat and mode to send its queued request.</p>}
      {failed.length > 0 && <div className="px-3 py-2 space-y-2" data-arc-recovery>
        {failed.map(({ request }) => {
          const owned = request.ownerId === ownerId && request.sessionId === currentSessionId && request.executionMode === executionMode;
          return <div key={request.id} className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-foreground/80">{request.content || 'Attachments'}</p>
              <p className="text-[11px] text-muted-foreground">{owned ? 'Saved for manual retry' : 'Open its original chat and mode to retry'}{request.images.length + request.documents.length > 0 ? ` · ${request.images.length + request.documents.length} ${request.images.length + request.documents.length === 1 ? "file" : "files"}` : ''}</p>
            </div>
            <button type="button" disabled={isLoading || !owned} onClick={() => onRetryRequest(request)}
              className="flex items-center gap-1 rounded-full px-2 py-1 text-xs text-primary hover:bg-primary/10 disabled:opacity-40" aria-label="Retry failed request">
              <RotateCcw className="h-3 w-3" />Retry
            </button>
            <button type="button" onClick={() => dismissFailure(request.id)} aria-label="Dismiss failed request" className="rounded-full p-1 text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /></button>
          </div>;
        })}
      </div>}
      {/* Queue items */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="max-h-40 overflow-y-auto px-2 py-1.5 space-y-1">
              {queue.map((msg, index) => (
                <motion.div
                  key={msg.id}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8, height: 0, marginBottom: 0 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 400 }}
                  className={cn(
                    "group flex items-center gap-1.5 px-2 py-1.5 rounded-xl transition-colors",
                    index === 0 && !isPaused
                      ? "bg-primary/10 ring-1 ring-primary/20"
                      : "hover:bg-muted/30"
                  )}
                >
                  <span className="text-[10px] font-mono text-muted-foreground w-4 text-center shrink-0">
                    {index + 1}
                  </span>

                  {editingId === msg.id ? (
                    <div className="flex-1 flex items-center gap-1">
                      <input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEdit();
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        autoFocus
                        className="flex-1 bg-transparent border-b border-primary/40 text-xs text-foreground outline-none px-1 py-0.5"
                      />
                      <button onClick={saveEdit} className="h-5 w-5 rounded-full flex items-center justify-center text-primary hover:bg-primary/10">
                        <Check className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="flex-1 text-xs text-foreground/80 truncate">
                        {msg.content || "Attachments"}
                        {(msg.images.length + msg.documents.length) > 0 && <span className="ml-1 text-muted-foreground">({msg.images.length + msg.documents.length} {msg.images.length + msg.documents.length === 1 ? "file" : "files"})</span>}
                      </p>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {index === 0 && (
                          <button
                            onClick={() => {
                              handleSendNext();
                            }}
                            disabled={isLoading || isPaused || !canSend}
                            className="h-5 w-5 rounded-full flex items-center justify-center text-primary hover:bg-primary/10 disabled:opacity-40"
                            title="Send now"
                          >
                            <Send className="h-2.5 w-2.5" />
                          </button>
                        )}
                        <button
                          onClick={() => startEdit(msg)}
                          className="h-5 w-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/30"
                          title="Edit"
                        >
                          <Pencil className="h-2.5 w-2.5" />
                        </button>
                        <button
                          onClick={() => removeFromQueue(msg.id)}
                          className="h-5 w-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          title="Remove"
                        >
                          <Trash2 className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    </>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
