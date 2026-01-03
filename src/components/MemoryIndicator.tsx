import { useState } from "react";
import { Brain, Search, Database, Globe, FileText } from "lucide-react";
import { motion } from "framer-motion";
import { MemoryAction } from "@/store/useArcStore";
import { SourcesAccordion } from "@/components/SourcesAccordion";
import { SearchResultsModal } from "@/components/SearchResultsModal";
import { Button } from "@/components/ui/button";

interface MemoryIndicatorProps {
  action: MemoryAction;
  messageContent?: string;
}

export const MemoryIndicator = ({ action, messageContent }: MemoryIndicatorProps) => {
  const [showArticle, setShowArticle] = useState(false);

  const getIcon = () => {
    switch (action.type) {
      case 'memory_saved':
        return <Brain className="h-3 w-3" />;
      case 'memory_accessed':
        return <Database className="h-3 w-3" />;
      case 'chats_searched':
        return <Search className="h-3 w-3" />;
      case 'web_searched':
        return <Globe className="h-3 w-3" />;
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
      case 'web_searched':
        return 'Web searched';
    }
  };

  // For web searches, show the sources accordion instead of simple indicator
  if (action.type === 'web_searched' && action.sources && action.sources.length > 0) {
    return (
      <div className="flex flex-col gap-1 w-full max-w-full overflow-hidden">
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="flex items-center gap-2 text-[11px] text-muted-foreground/70 mt-1.5"
        >
          <span className="text-primary/60">{getIcon()}</span>
          <span className="truncate max-w-[200px]">{getLabel()}</span>
          {messageContent && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowArticle(true)}
              className="h-5 px-2 text-[10px] text-primary/70 hover:text-primary hover:bg-primary/10"
            >
              <FileText className="h-3 w-3 mr-1" />
              Reader Mode
            </Button>
          )}
        </motion.div>
        <SourcesAccordion sources={action.sources} />
        
        {messageContent && (
          <SearchResultsModal
            isOpen={showArticle}
            onClose={() => setShowArticle(false)}
            content={messageContent}
            sources={action.sources}
          />
        )}
      </div>
    );
  }

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
