import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, MessageCircle, Sparkles, PenTool, Code } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface QuickPrompt {
  label: string;
  prompt: string;
}

interface PromptLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  prompts: QuickPrompt[];
  onSelectPrompt: (prompt: string) => void;
}

type TabType = 'chat' | 'create' | 'write' | 'code';

export function PromptLibrary({ isOpen, onClose, prompts, onSelectPrompt }: PromptLibraryProps) {
  const [activeTab, setActiveTab] = useState<TabType>('chat');

  // Categorize prompts (6 per category based on order in MobileChatApp)
  const chatPrompts = prompts.slice(0, 6);
  const createPrompts = prompts.slice(6, 12);
  const writePrompts = prompts.slice(12, 18);
  const codePrompts = prompts.slice(18, 24);

  const getCurrentPrompts = () => {
    switch (activeTab) {
      case 'chat': return chatPrompts;
      case 'create': return createPrompts;
      case 'write': return writePrompts;
      case 'code': return codePrompts;
      default: return chatPrompts;
    }
  };

  const tabs = [
    { id: 'chat' as TabType, label: 'Chat', icon: MessageCircle },
    { id: 'create' as TabType, label: 'Create', icon: Sparkles },
    { id: 'write' as TabType, label: 'Write', icon: PenTool },
    { id: 'code' as TabType, label: 'Code', icon: Code },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50"
          />

          {/* Drawer */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border rounded-t-3xl shadow-2xl max-h-[75vh] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
              <h3 className="text-lg font-semibold">Prompt Library</h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="rounded-full"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Tab Navigation */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/30 overflow-x-auto scrollbar-hide">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "relative flex items-center gap-2 px-4 py-2 rounded-full transition-colors whitespace-nowrap",
                      activeTab === tab.id
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-sm font-medium">{tab.label}</span>
                    
                    {activeTab === tab.id && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute inset-0 bg-primary/10 rounded-full -z-10"
                        transition={{ type: "spring", duration: 0.5 }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Prompt Grid */}
            <div className="flex-1 overflow-y-auto p-4 overscroll-contain">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="grid grid-cols-2 sm:grid-cols-3 gap-3 pb-4"
              >
                {getCurrentPrompts().map((prompt, index) => (
                  <motion.button
                    key={index}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => {
                      onSelectPrompt(prompt.prompt);
                      onClose();
                    }}
                    className="group relative p-4 rounded-xl bg-background/40 backdrop-blur-sm border border-border/50 hover:border-primary/40 hover:bg-background/60 transition-all duration-300 text-left"
                  >
                    <span className="text-base font-medium">{prompt.label}</span>
                    
                    {/* Subtle hover effect */}
                    <motion.div
                      className="absolute inset-0 rounded-xl bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity"
                      initial={false}
                    />
                  </motion.button>
                ))}
              </motion.div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
