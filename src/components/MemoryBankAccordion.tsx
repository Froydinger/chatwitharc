import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Plus, Trash2, Edit2, Check, X } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { GlassButton } from "@/components/ui/glass-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface Memory {
  id: string;
  date: string;
  content: string;
}

interface MemoryBankAccordionProps {
  memories: Memory[];
  onMemoriesChange: (memories: Memory[]) => void;
  onClearAll: () => void;
}

export function MemoryBankAccordion({ 
  memories, 
  onMemoriesChange,
  onClearAll 
}: MemoryBankAccordionProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newContent, setNewContent] = useState("");

  const handleDelete = (id: string) => {
    onMemoriesChange(memories.filter(m => m.id !== id));
  };

  const handleEdit = (memory: Memory) => {
    setEditingId(memory.id);
    setEditContent(memory.content);
  };

  const handleSaveEdit = (id: string) => {
    onMemoriesChange(
      memories.map(m => m.id === id ? { ...m, content: editContent } : m)
    );
    setEditingId(null);
    setEditContent("");
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditContent("");
  };

  const handleAddMemory = () => {
    if (!newContent.trim()) return;
    
    const date = newDate || new Date().toLocaleDateString('en-US', { 
      month: 'numeric', 
      day: 'numeric', 
      year: 'numeric' 
    });
    
    const newMemory: Memory = {
      id: crypto.randomUUID(),
      date,
      content: newContent.trim()
    };
    
    onMemoriesChange([...memories, newMemory]);
    setNewDate("");
    setNewContent("");
    setIsAdding(false);
  };

  const handleCancelAdd = () => {
    setNewDate("");
    setNewContent("");
    setIsAdding(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium text-foreground">Memory Bank</label>
          <p className="text-xs text-muted-foreground">Information Arc remembers from conversations</p>
        </div>
        <div className="flex items-center gap-2">
          <GlassButton
            variant="ghost"
            size="sm"
            onClick={() => setIsAdding(true)}
            disabled={isAdding}
          >
            <Plus className="w-3 h-3 mr-1" />
            Add Memory
          </GlassButton>
          {memories.length > 0 && (
            <GlassButton
              variant="ghost"
              size="sm"
              onClick={onClearAll}
              className="text-destructive hover:text-destructive"
            >
              <X className="w-3 h-3 mr-1" />
              Clear All
            </GlassButton>
          )}
        </div>
      </div>

      {/* Add New Memory Form */}
      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="glass border border-glass-border rounded-lg p-4 space-y-3"
          >
            <Input
              placeholder="Date (optional - defaults to today)"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="glass border-glass-border"
            />
            <Textarea
              placeholder="Memory content..."
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              className="glass border-glass-border min-h-[80px] resize-none"
            />
            <div className="flex items-center gap-2">
              <GlassButton
                variant="ghost"
                size="sm"
                onClick={handleAddMemory}
                disabled={!newContent.trim()}
              >
                <Check className="w-3 h-3 mr-1" />
                Save
              </GlassButton>
              <GlassButton
                variant="ghost"
                size="sm"
                onClick={handleCancelAdd}
              >
                <X className="w-3 h-3 mr-1" />
                Cancel
              </GlassButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Memory List */}
      {memories.length === 0 && !isAdding ? (
        <div className="glass border border-glass-border rounded-lg p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No memories yet. Arc will automatically add things here when you say "remember this"...
          </p>
        </div>
      ) : (
        <Accordion type="single" collapsible className="space-y-2">
          {memories.map((memory) => (
            <AccordionItem
              key={memory.id}
              value={memory.id}
              className="glass border border-glass-border rounded-lg overflow-hidden"
            >
              <AccordionTrigger className="px-4 py-3 hover:no-underline group">
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-3 text-left">
                    <span className="text-xs font-mono text-muted-foreground">
                      [{memory.date}]
                    </span>
                    <span className="text-sm text-foreground line-clamp-1">
                      {memory.content}
                    </span>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-3">
                {editingId === memory.id ? (
                  <div className="space-y-3">
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="glass border-glass-border min-h-[80px] resize-none"
                    />
                    <div className="flex items-center gap-2">
                      <GlassButton
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSaveEdit(memory.id)}
                      >
                        <Check className="w-3 h-3 mr-1" />
                        Save
                      </GlassButton>
                      <GlassButton
                        variant="ghost"
                        size="sm"
                        onClick={handleCancelEdit}
                      >
                        <X className="w-3 h-3 mr-1" />
                        Cancel
                      </GlassButton>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {memory.content}
                    </p>
                    <div className="flex items-center gap-2">
                      <GlassButton
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(memory)}
                      >
                        <Edit2 className="w-3 h-3 mr-1" />
                        Edit
                      </GlassButton>
                      <GlassButton
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(memory.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Delete
                      </GlassButton>
                    </div>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}

// Helper function to parse bracketed memory format
export function parseMemoriesFromText(text: string): Memory[] {
  if (!text || !text.trim()) return [];
  
  const memories: Memory[] = [];
  // Match pattern: [date] content
  const regex = /\[([^\]]+)\]\s*([^\[]+)/g;
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    const date = match[1].trim();
    const content = match[2].trim();
    
    if (content) {
      memories.push({
        id: crypto.randomUUID(),
        date,
        content
      });
    }
  }
  
  return memories;
}

// Helper function to convert memories back to bracketed text format
export function formatMemoriesToText(memories: Memory[]): string {
  return memories
    .map(m => `[${m.date}] ${m.content}`)
    .join('\n\n');
}
