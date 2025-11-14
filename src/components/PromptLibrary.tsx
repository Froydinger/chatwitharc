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
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 bg-background/60 backdrop-blur-md z-[9998]"
          />

          {/* Drawer - snappy with rebound */}
          <motion.div
            initial={{ y: "100%", scale: 0.95 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: "100%", scale: 0.95 }}
            transition={{ type: "spring", damping: 18, stiffness: 320, mass: 0.65 }}
            className="fixed bottom-0 left-0 right-0 z-[9999] backdrop-blur-2xl bg-background/80 border-t border-border/30 rounded-t-3xl shadow-2xl max-h-[75vh] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/30 backdrop-blur-xl bg-background/40">
              <h3 className="text-lg font-semibold">Prompt Library</h3>
              <div className="flex items-center gap-2">
                {activeTab !== 'smart' && (
                  <motion.div whileHover={{ scale: 1.1, rotate: 180 }} whileTap={{ scale: 0.9 }} transition={{ type: "spring", damping: 15, stiffness: 300 }}>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        refreshPrompts(activeTab, true); // Force refresh bypasses cache
                        toast.success('Prompts refreshed!');
                      }}
                      className="rounded-full backdrop-blur-xl bg-background/40 hover:bg-background/60"
                      title="Refresh prompts"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </motion.div>
                )}
                <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} transition={{ type: "spring", damping: 15, stiffness: 300 }}>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onClose}
                    className="rounded-full backdrop-blur-xl bg-background/40 hover:bg-background/60"
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </motion.div>
              </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/20 overflow-x-auto scrollbar-hide backdrop-blur-lg bg-background/20">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <motion.button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={cn(
                      "relative flex items-center gap-2 rounded-full transition-all duration-300 whitespace-nowrap",
                      isActive
                        ? "px-4 py-2 backdrop-blur-xl bg-background/90 text-foreground shadow-lg border border-primary/40 shadow-primary/20"
                        : "px-2 py-2 text-muted-foreground hover:text-foreground hover:bg-background/40"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {isActive && (
                      <motion.span
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: "auto" }}
                        exit={{ opacity: 0, width: 0 }}
                        className="text-sm font-medium overflow-hidden"
                      >
                        {tab.label}
                      </motion.span>
                    )}

                    {isActive && (
                      <motion.div
                        layoutId="activePromptTab"
                        className="absolute inset-0 backdrop-blur-xl bg-background/90 rounded-full -z-10 border border-primary/40 shadow-[0_0_20px_hsl(var(--primary)/0.3)]"
                        transition={{ type: "spring", damping: 20, stiffness: 300 }}
                      />
                    )}
                  </motion.button>
                );
              })}
            </div>

            {/* Prompt Grid */}
            <div className="flex-1 overflow-y-auto p-4 overscroll-contain">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pb-4">
                {isCurrentTabLoading() ? (
                  <div className="col-span-full flex items-center justify-center py-12">
                    <div className="flex flex-col items-center gap-3">
                      <Sparkles className="h-8 w-8 text-primary animate-pulse" />
                      <p className="text-sm text-muted-foreground">
                        {activeTab === 'smart'
                          ? 'Analyzing your conversations...'
                          : 'Generating fresh prompts...'}
                      </p>
                    </div>
                  </div>
                ) : getCurrentPrompts().length === 0 && activeTab === 'smart' ? (
                  <div className="col-span-full flex items-center justify-center py-12">
                    <div className="flex flex-col items-center gap-3 text-center">
                      <Brain className="h-8 w-8 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Start chatting to get personalized suggestions!</p>
                    </div>
                  </div>
                ) : (
                  getCurrentPrompts().map((prompt, index) => (
                    <motion.button
                      key={`${activeTab}-${prompt.label}`}
                      whileHover={{ scale: 1.05, y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        onSelectPrompt(prompt.prompt);
                        onClose();
                      }}
                      className="group relative p-4 rounded-xl backdrop-blur-xl bg-background/60 border border-border/40 hover:border-primary/50 hover:bg-background/80 hover:shadow-lg transition-all duration-300 text-left"
                    >
                      <span className="text-base font-medium relative z-10">{prompt.label}</span>

                      {/* Subtle hover effect */}
                      <motion.div
                        className="absolute inset-0 rounded-xl bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                        initial={false}
                      />
                    </motion.button>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
