import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, MessageCircle, Sparkles, PenTool, Code, Brain, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { generatePromptsByCategory } from "@/utils/promptGenerator";
import { getCachedPrompts } from "@/hooks/usePromptPreload";

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

type TabType = 'chat' | 'create' | 'write' | 'code' | 'smart';

export function PromptLibrary({ isOpen, onClose, prompts, onSelectPrompt }: PromptLibraryProps) {
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  const [smartPrompts, setSmartPrompts] = useState<QuickPrompt[]>([]);
  const [isLoadingSmartPrompts, setIsLoadingSmartPrompts] = useState(false);

  // State for dynamically generated prompts
  const [chatPrompts, setChatPrompts] = useState<QuickPrompt[]>([]);
  const [createPrompts, setCreatePrompts] = useState<QuickPrompt[]>([]);
  const [writePrompts, setWritePrompts] = useState<QuickPrompt[]>([]);
  const [codePrompts, setCodePrompts] = useState<QuickPrompt[]>([]);

  // Loading states for each category
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [isLoadingCreate, setIsLoadingCreate] = useState(false);
  const [isLoadingWrite, setIsLoadingWrite] = useState(false);
  const [isLoadingCode, setIsLoadingCode] = useState(false);

  // Generate initial prompts on mount
  useEffect(() => {
    if (isOpen) {
      refreshPrompts('all');
    }
  }, [isOpen]);

  // Function to generate AI prompts for a category
  const generateAIPrompts = async (category: 'chat' | 'create' | 'write' | 'code', forceRefresh = false): Promise<QuickPrompt[]> => {
    // Check cache first for instant load (unless forcing refresh)
    if (!forceRefresh) {
      const cached = getCachedPrompts(category);
      if (cached) {
        console.log(`⚡ Using cached ${category} prompts (instant load)`);
        return cached;
      }
    } else {
      console.log(`🔄 Force refreshing ${category} prompts - bypassing cache`);
    }

    try {
      console.log(`🎲 Generating fresh AI prompts for ${category}...`);
      const { data, error } = await supabase.functions.invoke('generate-category-prompts', {
        body: { category }
      });

      if (error) {
        console.error(`Failed to generate ${category} prompts:`, error);
        // Fallback to hardcoded prompts
        return generatePromptsByCategory(category);
      }

      const prompts = data?.prompts || generatePromptsByCategory(category);
      console.log(`✨ Generated ${prompts.length} new ${category} prompts:`, prompts.map(p => p.label));

      // Cache the new prompts
      try {
        sessionStorage.setItem(`arc_prompts_cache_${category}`, JSON.stringify(prompts));
        console.log(`💾 Cached new ${category} prompts`);
      } catch (e) {
        console.error('Failed to cache prompts:', e);
      }

      return prompts;
    } catch (error) {
      console.error(`Error generating ${category} prompts:`, error);
      // Fallback to hardcoded prompts
      return generatePromptsByCategory(category);
    }
  };

  // Function to refresh prompts for a specific category or all
  const refreshPrompts = async (category: TabType | 'all', forceRefresh = false) => {
    if (category === 'all' || category === 'chat') {
      setIsLoadingChat(true);
      const prompts = await generateAIPrompts('chat', forceRefresh);
      setChatPrompts(prompts);
      setIsLoadingChat(false);
    }
    if (category === 'all' || category === 'create') {
      setIsLoadingCreate(true);
      const prompts = await generateAIPrompts('create', forceRefresh);
      setCreatePrompts(prompts);
      setIsLoadingCreate(false);
    }
    if (category === 'all' || category === 'write') {
      setIsLoadingWrite(true);
      const prompts = await generateAIPrompts('write', forceRefresh);
      setWritePrompts(prompts);
      setIsLoadingWrite(false);
    }
    if (category === 'all' || category === 'code') {
      setIsLoadingCode(true);
      const prompts = await generateAIPrompts('code', forceRefresh);
      setCodePrompts(prompts);
      setIsLoadingCode(false);
    }
  };

  const getCurrentPrompts = () => {
    switch (activeTab) {
      case 'chat': return chatPrompts;
      case 'create': return createPrompts;
      case 'write': return writePrompts;
      case 'code': return codePrompts;
      case 'smart': return smartPrompts;
      default: return chatPrompts;
    }
  };

  const isCurrentTabLoading = () => {
    switch (activeTab) {
      case 'chat': return isLoadingChat;
      case 'create': return isLoadingCreate;
      case 'write': return isLoadingWrite;
      case 'code': return isLoadingCode;
      case 'smart': return isLoadingSmartPrompts;
      default: return false;
    }
  };

  const tabs = [
    { id: 'chat' as TabType, label: 'Chat', icon: MessageCircle },
    { id: 'create' as TabType, label: 'Create', icon: Sparkles },
    { id: 'write' as TabType, label: 'Write', icon: PenTool },
    { id: 'code' as TabType, label: 'Code', icon: Code },
    { id: 'smart' as TabType, label: 'Smart', icon: Brain },
  ];

  // Fetch smart prompts when Smart tab is clicked
  useEffect(() => {
    if (activeTab === 'smart' && smartPrompts.length === 0 && !isLoadingSmartPrompts) {
      setIsLoadingSmartPrompts(true);
      
      supabase.functions
        .invoke('generate-smart-prompts')
        .then(({ data, error }) => {
          if (error) {
            console.error('Failed to generate smart prompts:', error);
            toast.error('Failed to generate smart suggestions');
            setSmartPrompts([
              { label: '💬 Continue our last conversation', prompt: 'Can we continue where we left off in our last conversation?' },
              { label: '📝 Summarize recent chats', prompt: 'Can you summarize what we\'ve discussed recently?' },
              { label: '🔍 Find something we discussed', prompt: 'Help me find something we talked about before' },
            ]);
          } else if (data?.prompts) {
            setSmartPrompts(data.prompts);
          }
        })
        .finally(() => {
          setIsLoadingSmartPrompts(false);
        });
    }
  }, [activeTab]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop with blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-xl z-[9998] flex items-center justify-center p-4"
          />

          {/* Center Modal - gorgeous redesign */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{
              type: "spring",
              damping: 25,
              stiffness: 400,
              mass: 0.8
            }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999] w-[calc(100vw-2rem)] max-w-3xl max-h-[90vh] sm:max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Glass card container */}
            <div className="relative flex flex-col h-full max-h-[90vh] sm:max-h-[85vh] rounded-3xl overflow-hidden border border-border/40 shadow-2xl backdrop-blur-2xl bg-gradient-to-br from-background/95 via-background/90 to-background/95">
              {/* Ambient glow effect */}
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 pointer-events-none" />

              {/* Header with elegant design */}
              <div className="relative flex items-center justify-between px-6 sm:px-8 py-5 sm:py-6 border-b border-border/30 backdrop-blur-xl bg-background/40">
                <div className="flex items-center gap-3">
                  <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{
                      type: "spring",
                      damping: 15,
                      stiffness: 300,
                      delay: 0.1
                    }}
                    className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center"
                  >
                    <Sparkles className="h-5 w-5 text-primary" />
                  </motion.div>
                  <div>
                    <motion.h3
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.15 }}
                      className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent"
                    >
                      Prompt Library
                    </motion.h3>
                    <motion.p
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 }}
                      className="text-xs text-muted-foreground hidden sm:block"
                    >
                      {getCurrentPrompts().length} prompts available
                    </motion.p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {activeTab !== 'smart' && (
                    <motion.div
                      initial={{ scale: 0, rotate: -90 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{
                        type: "spring",
                        damping: 15,
                        stiffness: 300,
                        delay: 0.2
                      }}
                      whileHover={{ scale: 1.05, rotate: 90 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          refreshPrompts(activeTab, true);
                          toast.success('Prompts refreshed!');
                        }}
                        className="h-9 w-9 rounded-xl bg-background/60 hover:bg-background/80 border border-border/40 hover:border-primary/50 transition-all"
                        title="Refresh prompts"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </motion.div>
                  )}

                  <motion.div
                    initial={{ scale: 0, rotate: 90 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{
                      type: "spring",
                      damping: 15,
                      stiffness: 300,
                      delay: 0.25
                    }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={onClose}
                      className="h-9 w-9 rounded-xl bg-background/60 hover:bg-background/80 border border-border/40 hover:border-destructive/50 transition-all"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </motion.div>
                </div>
              </div>

              {/* Tab Navigation - elegant pill design */}
              <div className="relative px-6 sm:px-8 pt-5 pb-4">
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
                  {tabs.map((tab, index) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                      <motion.button
                        key={tab.id}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 + index * 0.05 }}
                        onClick={() => setActiveTab(tab.id)}
                        whileHover={{ scale: 1.03, y: -1 }}
                        whileTap={{ scale: 0.97 }}
                        className={cn(
                          "relative flex items-center gap-2.5 px-4 py-2.5 rounded-xl transition-all duration-300 whitespace-nowrap font-medium text-sm",
                          isActive
                            ? "text-foreground shadow-lg"
                            : "text-muted-foreground hover:text-foreground hover:bg-background/40"
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span>{tab.label}</span>

                        {isActive && (
                          <motion.div
                            layoutId="activePromptTab"
                            className="absolute inset-0 rounded-xl bg-gradient-to-br from-background/90 to-background/70 border border-primary/30 shadow-[0_0_30px_hsl(var(--primary)/0.15)]"
                            style={{ zIndex: -1 }}
                            transition={{
                              type: "spring",
                              damping: 20,
                              stiffness: 300
                            }}
                          />
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* Prompt Grid - beautiful cards */}
              <div className="flex-1 overflow-y-auto px-6 sm:px-8 pb-6 overscroll-contain">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  {isCurrentTabLoading() ? (
                    <div className="col-span-full flex items-center justify-center py-16">
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex flex-col items-center gap-4"
                      >
                        <motion.div
                          animate={{
                            rotate: 360,
                            scale: [1, 1.1, 1]
                          }}
                          transition={{
                            rotate: { duration: 2, repeat: Infinity, ease: "linear" },
                            scale: { duration: 1.5, repeat: Infinity, ease: "easeInOut" }
                          }}
                        >
                          <Sparkles className="h-10 w-10 text-primary" />
                        </motion.div>
                        <p className="text-sm text-muted-foreground font-medium">
                          {activeTab === 'smart'
                            ? 'Analyzing your conversations...'
                            : 'Generating fresh prompts...'}
                        </p>
                      </motion.div>
                    </div>
                  ) : getCurrentPrompts().length === 0 && activeTab === 'smart' ? (
                    <div className="col-span-full flex items-center justify-center py-16">
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex flex-col items-center gap-4 text-center max-w-xs"
                      >
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                          <Brain className="h-8 w-8 text-primary/70" />
                        </div>
                        <div>
                          <h4 className="font-semibold mb-1">No smart suggestions yet</h4>
                          <p className="text-sm text-muted-foreground">Start chatting to get personalized suggestions!</p>
                        </div>
                      </motion.div>
                    </div>
                  ) : (
                    getCurrentPrompts().map((prompt, index) => (
                      <motion.button
                        key={`${activeTab}-${prompt.label}`}
                        layout
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{
                          layout: { type: "spring", damping: 20, stiffness: 300 },
                          opacity: { duration: 0.3, delay: index * 0.04 },
                          scale: { duration: 0.3, delay: index * 0.04 },
                          y: { duration: 0.3, delay: index * 0.04 }
                        }}
                        whileHover={{
                          scale: 1.02,
                          y: -4,
                          transition: { duration: 0.2 }
                        }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          onSelectPrompt(prompt.prompt);
                          onClose();
                        }}
                        className="group relative p-5 rounded-2xl backdrop-blur-xl bg-gradient-to-br from-background/80 to-background/60 border border-border/40 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 text-left overflow-hidden"
                      >
                        {/* Gradient overlay on hover */}
                        <motion.div
                          className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                          initial={false}
                        />

                        {/* Content */}
                        <span className="relative text-sm sm:text-base font-medium leading-relaxed block">
                          {prompt.label}
                        </span>

                        {/* Subtle shine effect */}
                        <motion.div
                          className="absolute inset-0 opacity-0 group-hover:opacity-100"
                          initial={false}
                        >
                          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
                        </motion.div>
                      </motion.button>
                    ))
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
