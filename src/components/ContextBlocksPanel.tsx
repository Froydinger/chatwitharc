import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, Plus, Trash2, Edit2, Check, X, Sparkles, FileText } from "lucide-react";
import { useContextBlocks, type ContextBlock } from "@/hooks/useContextBlocks";
import { GlassButton } from "@/components/ui/glass-button";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface ContextBlocksPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ContextBlocksPanel({ isOpen, onClose }: ContextBlocksPanelProps) {
  const { blocks, loading, addBlock, updateBlock, deleteBlock, clearAll } = useContextBlocks();
  const [isAdding, setIsAdding] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const isMobile = useIsMobile();
  const panelRef = useRef<HTMLDivElement>(null);

  // Listen for external updates (from memory saves)
  useEffect(() => {
    const handler = () => {
      // Refetch is handled by the hook's dependency on user
      // Force a re-render by triggering a state update
      window.location; // No-op, the event triggers refetch via the hook
    };
    window.addEventListener('context-blocks-updated', handler);
    return () => window.removeEventListener('context-blocks-updated', handler);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to avoid immediate close from the trigger click
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  const handleAdd = async () => {
    if (!newContent.trim()) return;
    await addBlock(newContent.trim(), 'manual');
    setNewContent("");
    setIsAdding(false);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editContent.trim()) return;
    await updateBlock(editingId, editContent.trim());
    setEditingId(null);
    setEditContent("");
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, y: -8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.96 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className={cn(
            "fixed z-[60] glass-panel border border-border/40 rounded-2xl shadow-2xl overflow-hidden",
            isMobile
              ? "inset-x-3 top-16 max-h-[70vh]"
              : "right-4 top-16 w-[380px] max-h-[70vh]"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Context</h3>
              <span className="text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded-full">
                {blocks.length}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <GlassButton
                variant="ghost"
                size="sm"
                onClick={() => setIsAdding(true)}
                disabled={isAdding}
                className="h-7 px-2 text-xs"
              >
                <Plus className="w-3 h-3 mr-1" />
                Add
              </GlassButton>
              {blocks.length > 0 && (
                <GlassButton
                  variant="ghost"
                  size="sm"
                  onClick={clearAll}
                  className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-3 h-3" />
                </GlassButton>
              )}
              <GlassButton
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="h-7 w-7 p-0"
              >
                <X className="w-3.5 h-3.5" />
              </GlassButton>
            </div>
          </div>

          {/* Content */}
          <div className="overflow-y-auto max-h-[calc(70vh-52px)] p-3 space-y-2 scrollbar-hide">
            {/* Add New Block Form */}
            <AnimatePresence>
              {isAdding && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="glass border border-border/30 rounded-xl p-3 space-y-2"
                >
                  <Textarea
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    placeholder="Add context about yourself, preferences, or anything Arc should know..."
                    className="glass border-border/30 min-h-[70px] resize-none text-sm"
                    autoFocus={!isMobile}
                  />
                  <div className="flex items-center gap-2">
                    <GlassButton
                      variant="ghost"
                      size="sm"
                      onClick={handleAdd}
                      disabled={!newContent.trim()}
                      className="h-7 text-xs"
                    >
                      <Check className="w-3 h-3 mr-1" />
                      Save
                    </GlassButton>
                    <GlassButton
                      variant="ghost"
                      size="sm"
                      onClick={() => { setIsAdding(false); setNewContent(""); }}
                      className="h-7 text-xs"
                    >
                      <X className="w-3 h-3 mr-1" />
                      Cancel
                    </GlassButton>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Empty state */}
            {blocks.length === 0 && !isAdding && !loading && (
              <div className="text-center py-8 px-4">
                <Brain className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No context yet</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Add things Arc should know about you, or tell Arc to "remember" something in chat
                </p>
              </div>
            )}

            {/* Block list */}
            {blocks.map((block) => (
              <motion.div
                key={block.id}
                layout
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="glass border border-border/20 rounded-xl p-3 group"
              >
                {editingId === block.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="glass border-border/30 min-h-[60px] resize-none text-sm"
                    />
                    <div className="flex items-center gap-2">
                      <GlassButton variant="ghost" size="sm" onClick={handleSaveEdit} className="h-6 text-xs">
                        <Check className="w-3 h-3 mr-1" /> Save
                      </GlassButton>
                      <GlassButton variant="ghost" size="sm" onClick={() => setEditingId(null)} className="h-6 text-xs">
                        <X className="w-3 h-3 mr-1" /> Cancel
                      </GlassButton>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-start gap-2">
                      {block.source === 'memory' ? (
                        <Sparkles className="h-3 w-3 text-primary/60 mt-0.5 shrink-0" />
                      ) : (
                        <FileText className="h-3 w-3 text-muted-foreground/60 mt-0.5 shrink-0" />
                      )}
                      <p className="text-sm text-foreground leading-relaxed flex-1">{block.content}</p>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[10px] text-muted-foreground/50">
                        {new Date(block.created_at).toLocaleDateString()}
                      </span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <GlassButton
                          variant="ghost"
                          size="sm"
                          onClick={() => { setEditingId(block.id); setEditContent(block.content); }}
                          className="h-6 w-6 p-0"
                        >
                          <Edit2 className="w-3 h-3" />
                        </GlassButton>
                        <GlassButton
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteBlock(block.id)}
                          className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-3 h-3" />
                        </GlassButton>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            ))}

            {loading && (
              <div className="flex items-center justify-center py-4">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
