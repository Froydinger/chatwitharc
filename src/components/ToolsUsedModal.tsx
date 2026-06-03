import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Globe, Sparkles, Search, Database, Brain } from "lucide-react";
import { MemoryAction } from "@/store/useArcStore";
import { SourcesAccordion } from "@/components/SourcesAccordion";
import { Button } from "@/components/ui/button";
import { useSearchStore, SearchResult } from "@/store/useSearchStore";

interface ToolsUsedModalProps {
  isOpen: boolean;
  onClose: () => void;
  actions: MemoryAction[];
  messageContent?: string;
}

export function ToolsUsedModal({ isOpen, onClose, actions, messageContent }: ToolsUsedModalProps) {
  const { openSearchMode } = useSearchStore();

  if (!actions || actions.length === 0) return null;

  const webSearchAction = actions.find(a => a.type === 'web_searched');
  const memoryActions = actions.filter(a => a.type === 'memory_saved' || a.type === 'context_saved');
  const chatSearchActions = actions.filter(a => a.type === 'chats_searched');
  const memoryAccessedActions = actions.filter(a => a.type === 'memory_accessed');

  const handleOpenSearchMode = () => {
    if (!webSearchAction?.sources || !messageContent) return;

    const results: SearchResult[] = webSearchAction.sources.map((source, index) => ({
      id: `result-${index}`,
      title: source.title,
      url: source.url,
      snippet: source.snippet || source.content || '',
    }));

    openSearchMode(webSearchAction.query || '', results, messageContent);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="glass-card rounded-2xl p-6 max-w-md w-full max-h-[80vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">Tools Used</h2>
              <button
                onClick={onClose}
                className="h-6 w-6 rounded-full hover:bg-muted flex items-center justify-center transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Web Search */}
              {webSearchAction && (
                <div className="space-y-3 pb-4 border-b border-border/50">
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Globe className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-foreground">Web Search</div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {webSearchAction.sources?.length || 0} sources found
                      </p>
                    </div>
                  </div>

                  {webSearchAction.sources && webSearchAction.sources.length > 0 && (
                    <div className="pl-11">
                      <SourcesAccordion sources={webSearchAction.sources} messageContent={messageContent} />
                    </div>
                  )}

                  {messageContent && (
                    <div className="pl-11">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleOpenSearchMode}
                        className="w-full text-xs"
                      >
                        <Sparkles className="h-3 w-3 mr-1.5" />
                        Open Search Mode
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Memory Saved */}
              {memoryActions.length > 0 && (
                <div className="space-y-2 pb-4 border-b border-border/50">
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Brain className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-foreground">Memory</div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {memoryActions.length} item{memoryActions.length !== 1 ? 's' : ''} saved
                      </p>
                    </div>
                  </div>
                  <div className="pl-11 space-y-1.5">
                    {memoryActions.map((action, i) => (
                      <div key={i} className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-2">
                        {action.type === 'context_saved' ? 'Remembered: ' : 'Saved: '}
                        <span className="text-foreground">{action.content}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Memory Accessed */}
              {memoryAccessedActions.length > 0 && (
                <div className="space-y-2 pb-4 border-b border-border/50">
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Database className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-foreground">Memory Accessed</div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Retrieved from your context
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Chats Searched */}
              {chatSearchActions.length > 0 && (
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Search className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-foreground">Past Chats Searched</div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Looked through your chat history
                    </p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
