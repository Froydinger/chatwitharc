import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Lightbulb, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { getModelForTask } from "@/store/useModelStore";
import { toast } from "sonner";
import { generatePromptsByCategory } from "@/utils/promptGenerator";
import { getCachedPrompts, CACHE_KEY_PREFIX } from "@/hooks/usePromptPreload";

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

// The library mirrors what ArcAI stands for: Ask, Reflect, Create.
type TabType = 'ask' | 'reflect' | 'create';

export function PromptLibrary({ isOpen, onClose, prompts, onSelectPrompt }: PromptLibraryProps) {
  const [activeTab, setActiveTab] = useState<TabType>('ask');

  // State for dynamically generated prompts
  const [askPrompts, setAskPrompts] = useState<QuickPrompt[]>([]);
  const [reflectPrompts, setReflectPrompts] = useState<QuickPrompt[]>([]);
  const [createPrompts, setCreatePrompts] = useState<QuickPrompt[]>([]);

  // Loading states for each category
  const [isLoadingAsk, setIsLoadingAsk] = useState(false);
  const [isLoadingReflect, setIsLoadingReflect] = useState(false);
  const [isLoadingCreate, setIsLoadingCreate] = useState(false);

  // Generate initial prompts on mount
  useEffect(() => {
    if (isOpen) {
      refreshPrompts('all');
    }
  }, [isOpen]);

  // Function to generate AI prompts for a category
  const generateAIPrompts = async (category: TabType, forceRefresh = false): Promise<QuickPrompt[]> => {
    // Check cache first for instant load (unless forcing refresh)
    if (!forceRefresh) {
      const cached = getCachedPrompts(category);
      if (cached) {
        console.log(`⚡ Using cached ${category} prompts (instant load)`);
        return cached;
      }
    } else {
      console.log(`🔄 Force refreshing ${category} prompts - bypassing cache`);
      // Clear cache when force refreshing
      try {
        sessionStorage.removeItem(`${CACHE_KEY_PREFIX}${category}`);
      } catch (e) {
        console.error('Failed to clear cache:', e);
      }
    }

    if (!supabase || !isSupabaseConfigured) {
      return generatePromptsByCategory(category);
    }

    try {
      console.log(`🎲 Generating fresh AI prompts for ${category}...`);
      // Pass selected model for prompt generation
      const selectedModel = getModelForTask('chat');
      const { data, error } = await supabase.functions.invoke('generate-category-prompts', {
        body: {
          category,
          // Pass timestamp to ensure backend generates fresh prompts
          timestamp: Date.now(),
          forceRefresh: forceRefresh,
          model: selectedModel
        }
      });

      if (error) {
        console.error(`Failed to generate ${category} prompts:`, error);
        // Fallback to freshly randomized hardcoded prompts (never cache fallbacks)
        return generatePromptsByCategory(category);
      }

      // An older deployment that does not know this category answers with its
      // own default set, which is how Ask and Reflect ended up showing the same
      // prompts. Only trust a response that says it is for what we asked for.
      const answeredForCategory = !data?.category || data.category === category;
      if (!answeredForCategory) {
        console.warn(`Prompt service answered for "${data.category}" when asked for "${category}" — using local prompts`);
        return generatePromptsByCategory(category);
      }

      const prompts = Array.isArray(data?.prompts) && data.prompts.length > 0
        ? data.prompts
        : generatePromptsByCategory(category);
      console.log(`✨ Generated ${prompts.length} new ${category} prompts:`, prompts.map(p => p.label));

      // Only cache successful API responses, not fallbacks
      if (data?.prompts && data.prompts.length > 0) {
        try {
          sessionStorage.setItem(`${CACHE_KEY_PREFIX}${category}`, JSON.stringify(prompts));
          console.log(`💾 Cached new ${category} prompts`);
        } catch (e) {
          console.error('Failed to cache prompts:', e);
        }
      }

      return prompts;
    } catch (error) {
      console.error(`Error generating ${category} prompts:`, error);
      // Fallback to freshly randomized hardcoded prompts (never cache fallbacks)
      return generatePromptsByCategory(category);
    }
  };

  // Function to refresh prompts for a specific category or all
  const refreshPrompts = async (category: TabType | 'all', forceRefresh = false) => {
    if (category === 'all' || category === 'ask') {
      setIsLoadingAsk(true);
      const prompts = await generateAIPrompts('ask', forceRefresh);
      setAskPrompts(prompts);
      setIsLoadingAsk(false);
    }
    if (category === 'all' || category === 'reflect') {
      setIsLoadingReflect(true);
      const prompts = await generateAIPrompts('reflect', forceRefresh);
      setReflectPrompts(prompts);
      setIsLoadingReflect(false);
    }
    if (category === 'all' || category === 'create') {
      setIsLoadingCreate(true);
      const prompts = await generateAIPrompts('create', forceRefresh);
      setCreatePrompts(prompts);
      setIsLoadingCreate(false);
    }
  };

  const getCurrentPrompts = () => {
    switch (activeTab) {
      case 'ask': return askPrompts;
      case 'reflect': return reflectPrompts;
      case 'create': return createPrompts;
      default: return askPrompts;
    }
  };

  const isCurrentTabLoading = () => {
    switch (activeTab) {
      case 'ask': return isLoadingAsk;
      case 'reflect': return isLoadingReflect;
      case 'create': return isLoadingCreate;
      default: return false;
    }
  };

  // Same colour language as the tools sheet: a tinted border and wash per tab,
  // stronger when selected. No icons, no drop shadow to get clipped.
  const tabs = [
    {
      id: 'ask' as TabType,
      label: 'Ask',
      activeClass: 'border-sky-500/40 bg-sky-500/15 text-sky-600 dark:text-sky-300',
      idleClass: 'border-sky-500/15 bg-sky-500/5 text-muted-foreground hover:bg-sky-500/10',
    },
    {
      id: 'reflect' as TabType,
      label: 'Reflect',
      activeClass: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300',
      idleClass: 'border-emerald-500/15 bg-emerald-500/5 text-muted-foreground hover:bg-emerald-500/10',
    },
    {
      id: 'create' as TabType,
      label: 'Create',
      activeClass: 'border-fuchsia-500/40 bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-300',
      idleClass: 'border-fuchsia-500/15 bg-fuchsia-500/5 text-muted-foreground hover:bg-fuchsia-500/10',
    },
  ];

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop with blur - serves as centering container */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-md z-[9998] flex items-center justify-center p-4"
          >
            {/* Center Modal - gorgeous redesign */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{
                type: "spring",
                damping: 28,
                stiffness: 350
              }}
              className="w-full max-w-3xl"
              onClick={(e) => e.stopPropagation()}
              style={{ willChange: 'transform, opacity' }}
            >
              {/* Glass card container with proper glass theming */}
              <div className="glass-panel relative flex flex-col max-h-[80vh] rounded-3xl overflow-hidden border border-white/[0.08] shadow-2xl">
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
                      damping: 12,
                      stiffness: 400,
                      delay: 0.05
                    }}
                    className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center"
                  >
                    <Lightbulb className="h-5 w-5 text-primary" />
                  </motion.div>
                  <div>
                    <motion.h3
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.08, duration: 0.2 }}
                      className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent"
                    >
                      Ideas
                    </motion.h3>
                    <motion.p
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1, duration: 0.2 }}
                      className="text-xs text-muted-foreground hidden sm:block"
                    >
                      {getCurrentPrompts().length} prompts available
                    </motion.p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {(
                    <motion.div
                      initial={{ scale: 0, rotate: -90 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{
                        type: "spring",
                        damping: 12,
                        stiffness: 400,
                        delay: 0.1
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
                        className="h-9 w-9 rounded-full glass-shimmer hover:border-primary/50 transition-all z-20"
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
                      damping: 12,
                      stiffness: 400,
                      delay: 0.12
                    }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={onClose}
                      className="h-9 w-9 rounded-full glass-shimmer hover:border-destructive/50 transition-all z-20"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </motion.div>
                </div>
              </div>

              {/* Tab Navigation — three equal, color-coded pills spanning the sheet */}
              <div className="px-6 sm:px-8 pt-5 pb-4 border-b border-border/20">
                <div className="grid grid-cols-3 gap-2">
                  {tabs.map((tab, index) => {
                    const isActive = activeTab === tab.id;
                    return (
                      <motion.button
                        key={tab.id}
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.12 + index * 0.03, duration: 0.2 }}
                        onClick={() => setActiveTab(tab.id)}
                        whileTap={{ scale: 0.98 }}
                        className={cn(
                          "w-full py-2.5 px-2 rounded-2xl border text-center font-semibold transition-all duration-200",
                          "text-[13px] sm:text-sm tracking-wide",
                          isActive ? tab.activeClass : tab.idleClass
                        )}
                      >
                        {tab.label}
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* Prompt Grid - beautiful cards with single scroll container */}
              <div 
                className="flex-1 overflow-y-auto px-6 sm:px-8 pb-6" 
                style={{ 
                  WebkitOverflowScrolling: 'touch',
                  touchAction: 'pan-y',
                  overscrollBehavior: 'contain',
                  willChange: 'scroll-position'
                }}
              >
                <AnimatePresence mode="wait">
                  <motion.div 
                    key={activeTab} 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15, ease: "easeInOut" }}
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 py-4"
                  >
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
                          <Lightbulb className="h-10 w-10 text-primary" />
                        </motion.div>
                        <p className="text-sm text-muted-foreground font-medium">
                          Generating fresh prompts...
                        </p>
                      </motion.div>
                    </div>
                  ) : (
                    getCurrentPrompts().map((prompt, index) => (
                      <motion.button
                        key={`${activeTab}-${index}-${prompt.label}`}
                        initial={false}
                        animate={{ opacity: 1 }}
                        transition={{
                          duration: 0.15,
                          delay: Math.min(index * 0.02, 0.2),
                          ease: "easeOut"
                        }}
                        whileHover={{
                          y: -2,
                          transition: { duration: 0.15, ease: "easeOut" }
                        }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          onSelectPrompt(prompt.prompt);
                          onClose();
                        }}
                        className="group relative p-5 rounded-2xl backdrop-blur-xl bg-gradient-to-br from-background/80 to-background/60 border border-border/40 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5 transition-all duration-200 text-left overflow-hidden"
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
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
