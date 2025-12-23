import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Globe, ChevronDown, ExternalLink } from "lucide-react";
import { WebSource } from "@/store/useArcStore";

interface SourcesAccordionProps {
  sources: WebSource[];
}

export const SourcesAccordion = ({ sources }: SourcesAccordionProps) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!sources || sources.length === 0) return null;

  // Extract domain from URL for display
  const getDomain = (url: string) => {
    try {
      const domain = new URL(url).hostname.replace('www.', '');
      return domain;
    } catch {
      return url;
    }
  };

  // Get favicon URL
  const getFavicon = (url: string) => {
    try {
      const domain = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
    } catch {
      return null;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="mt-3"
    >
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/50 border border-border/40 hover:bg-muted/70 transition-colors group"
      >
        <Globe className="h-3.5 w-3.5 text-primary/70" />
        <span className="text-xs font-medium text-muted-foreground">
          {sources.length} source{sources.length !== 1 ? 's' : ''} used
        </span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/70" />
        </motion.div>
      </button>

      {/* Sources List */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-1.5 pl-1">
              {sources.map((source, index) => (
                <motion.a
                  key={index}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="group flex items-start gap-2.5 p-2.5 rounded-lg bg-muted/30 border border-border/30 hover:bg-muted/50 hover:border-primary/30 transition-all"
                >
                  {/* Favicon */}
                  <div className="flex-shrink-0 mt-0.5">
                    <img
                      src={getFavicon(source.url) || ''}
                      alt=""
                      className="h-4 w-4 rounded"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-foreground/90 truncate">
                        {source.title || getDomain(source.url)}
                      </span>
                      <ExternalLink className="h-3 w-3 text-muted-foreground/50 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <span className="text-[10px] text-muted-foreground/60 truncate block">
                      {getDomain(source.url)}
                    </span>
                    {source.content && (
                      <p className="text-[11px] text-muted-foreground/70 line-clamp-2 mt-1">
                        {source.content}
                      </p>
                    )}
                  </div>
                </motion.a>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
