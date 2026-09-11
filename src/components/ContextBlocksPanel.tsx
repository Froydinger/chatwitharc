import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, Check, Edit2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useContextBlocks } from "@/hooks/useContextBlocks";
import { GlassButton } from "@/components/ui/glass-button";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface ContextBlocksPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

/** A single editable living-memory document. The compatibility hook hides the old slot storage. */
export function ContextBlocksPanel({ isOpen, onClose }: ContextBlocksPanelProps) {
  const { blocks, loading, addBlock, updateBlock, clearAll } = useContextBlocks();
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const isMobile = useIsMobile();
  const panelRef = useRef<HTMLDivElement>(null);
  const summary = blocks[0]?.content || "";

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    const timer = setTimeout(() => document.addEventListener("mousedown", handleClickOutside), 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  const startAdding = () => {
    setIsAdding(true);
    setIsEditing(false);
    setDraft("");
  };

  const startEditing = () => {
    setIsEditing(true);
    setIsAdding(false);
    setDraft(summary);
  };

  const cancel = () => {
    setIsAdding(false);
    setIsEditing(false);
    setDraft("");
  };

  const save = async () => {
    if (!draft.trim()) return;
    if (isEditing && blocks[0]) await updateBlock(blocks[0].id, draft.trim());
    else await addBlock(draft.trim(), "manual");
    cancel();
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
          className={cn("fixed z-[60] glass-panel border border-border/40 rounded-2xl shadow-2xl overflow-hidden", isMobile ? "inset-x-3 top-16 max-h-[70vh]" : "right-4 top-16 w-[380px] max-h-[70vh]")}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Arc's living memory</h3>
            </div>
            <div className="flex items-center gap-1">
              <GlassButton variant="ghost" size="sm" onClick={startAdding} disabled={isAdding || isEditing} className="h-7 px-2 text-xs"><Plus className="w-3 h-3 mr-1" /> Tell Arc</GlassButton>
              {summary && <GlassButton variant="ghost" size="sm" onClick={clearAll} className="h-7 px-2 text-xs text-destructive hover:text-destructive" title="Clear living memory"><Trash2 className="w-3 h-3" /></GlassButton>}
              <GlassButton variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0"><X className="w-3.5 h-3.5" /></GlassButton>
            </div>
          </div>

          <div className="overflow-y-auto max-h-[calc(70vh-52px)] p-3 scrollbar-hide">
            <p className="px-1 pb-3 text-xs leading-relaxed text-muted-foreground">Arc keeps one detailed, evolving summary about you. Tell Arc something naturally, or ask it to remember.</p>

            <AnimatePresence>
              {(isAdding || isEditing) && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="glass border border-border/30 rounded-xl p-3 space-y-2">
                  <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={isEditing ? "Edit Arc's full living memory summary..." : "Tell Arc something about you. It will merge this into the living summary..."} className="glass border-border/30 min-h-[120px] resize-none text-sm" autoFocus={!isMobile} />
                  <div className="flex items-center gap-2">
                    <GlassButton variant="ghost" size="sm" onClick={save} disabled={!draft.trim()} className="h-7 text-xs"><Check className="w-3 h-3 mr-1" /> Save summary</GlassButton>
                    <GlassButton variant="ghost" size="sm" onClick={cancel} className="h-7 text-xs"><X className="w-3 h-3 mr-1" /> Cancel</GlassButton>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {loading ? (
              <div className="flex items-center justify-center py-8"><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
            ) : !summary && !isAdding && !isEditing ? (
              <div className="text-center py-8 px-4"><Sparkles className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" /><p className="text-sm text-muted-foreground">Your living memory is empty</p><p className="text-xs text-muted-foreground/70 mt-1">Tell Arc who you are, what matters to you, or what you want remembered.</p></div>
            ) : summary && !isAdding && !isEditing ? (
              <div className="glass border border-border/20 rounded-xl p-3 group">
                <div className="flex items-start gap-2"><Sparkles className="h-3 w-3 text-primary/60 mt-0.5 shrink-0" /><p className="text-sm text-foreground leading-relaxed flex-1 whitespace-pre-wrap">{summary}</p></div>
                <div className="flex justify-end mt-2 opacity-0 group-hover:opacity-100 transition-opacity"><GlassButton variant="ghost" size="sm" onClick={startEditing} className="h-6 px-2 text-xs"><Edit2 className="w-3 h-3 mr-1" /> Edit summary</GlassButton></div>
              </div>
            ) : null}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
