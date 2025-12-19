import { Brain, Search, Database } from "lucide-react";
import { motion } from "framer-motion";
import { MemoryAction } from "@/store/useArcStore";

interface MemoryIndicatorProps {
  action: MemoryAction;
}

export const MemoryIndicator = ({ action }: MemoryIndicatorProps) => {
  const getIcon = () => {
    switch (action.type) {
      case 'memory_saved':
        return <Brain className="h-3 w-3" />;
      case 'memory_accessed':
        return <Database className="h-3 w-3" />;
      case 'chats_searched':
        return <Search className="h-3 w-3" />;
    }
  };

  const getLabel = () => {
    switch (action.type) {
      case 'memory_saved':
        return action.content ? `Saved: "${action.content}"` : 'Memory saved';
      case 'memory_accessed':
        return 'Memory accessed';
      case 'chats_searched':
        return 'Past chats searched';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70 mt-1.5"
    >
      <span className="text-primary/60">{getIcon()}</span>
      <span className="truncate max-w-[250px]">{getLabel()}</span>
    </motion.div>
  );
};
