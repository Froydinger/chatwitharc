import { Transition } from "@/components/transitions/Transition";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { ConditionalTransition } from "@/components/transitions/ConditionalTransition";
import { TransitionPart } from "@/components/transitions/TransitionPart";
import { SequencedTransition } from "@/components/transitions/SequencedTransition";
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
  workspaceUI?: boolean;
}

// The library mirrors what ArcAI stands for: Ask, Reflect, Create.
type TabType = 'ask' | 'reflect' | 'create';

export function PromptLibrary({ isOpen, onClose, prompts, onSelectPrompt, workspaceUI = false }: PromptLibraryProps) {
  const [activeTab, setActiveTab] = useState<TabType>('ask');

  // State for dynamically generated prompts (initialized immediately so tabs never show empty or wrong prompts)
  const [askPrompts, setAskPrompts] = useState<QuickPrompt[]>(() => {
    const cached = getCachedPrompts('ask');
    return cached && cached.length > 0 ? cached : generatePromptsByCategory('ask');
  });
  const [reflectPrompts, setReflectPrompts] = useState<QuickPrompt[]>(() => {
    const cached = getCachedPrompts('reflect');
    return cached && cached.length > 0 ? cached : generatePromptsByCategory('reflect');
  });
  const [createPrompts, setCreatePrompts] = useState<QuickPrompt[]>(() => {
    const cached = getCachedPrompts('create');
    return cached && cached.length > 0 ? cached : generatePromptsByCategory('create');
  });

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

      // Strictly verify category — reject responses meant for a different category
      const answeredForCategory = data?.category === category;
      if (!answeredForCategory) {
        console.warn(`Prompt service answered for "${data?.category}" when asked for "${category}" — using local prompts`);
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
      case 'ask': return askPrompts.length > 0 ? askPrompts : generatePromptsByCategory('ask');
      case 'reflect': return reflectPrompts.length > 0 ? reflectPrompts : generatePromptsByCategory('reflect');
      case 'create': return createPrompts.length > 0 ? createPrompts : generatePromptsByCategory('create');
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
    <ConditionalTransition preset="fade">
      {isOpen && (
          <div
            onClick={onClose}
            data-testid="arc-prompt-library"
            role={workspaceUI ? 'presentation' : undefined}
            className={cn("fixed inset-0 bg-black/40 backdrop-blur-md z-[9998] flex items-center justify-center p-4", workspaceUI && "workspace-ui ws-prompt-overlay")}
          >
            {/* Center Modal - gorgeous redesign */}
            <TransitionPart><div
              className={cn("w-full max-w-3xl", workspaceUI && "ws-prompt-dialog")}
              onClick={(e) => e.stopPropagation()}
              style={{ willChange: 'transform, opacity' }}
              role={workspaceUI ? 'dialog' : undefined}
              aria-modal={workspaceUI ? true : undefined}
              aria-label={workspaceUI ? 'Prompts and ideas' : undefined}
            >
              {/* Glass card container with proper glass theming */}
              <div className={cn("glass-panel relative flex flex-col max-h-[80vh] rounded-3xl overflow-hidden border border-white/[0.08] shadow-2xl", workspaceUI && "ws-prompt-card")}>
              {/* Ambient glow effect */}
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 pointer-events-none" />

              {/* Header with elegant design */}
              <div className={cn("relative flex items-center justify-between px-6 sm:px-8 py-5 sm:py-6 border-b border-border/30 backdrop-blur-xl bg-background/40", workspaceUI && "ws-prompt-heading")}>
                <div className="flex items-center gap-3">
                  <div className={cn("w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center", workspaceUI && "ws-prompt-mark")}>
                    <Lightbulb className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <Transition preset="page" delay={0.08}><h3 className={cn("text-xl sm:text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent", workspaceUI && "ws-prompt-title")}>
                      Ideas
                    </h3></Transition>
                    <Transition preset="page" delay={0.1}><p className={cn("text-xs text-muted-foreground hidden sm:block", workspaceUI && "ws-prompt-count")}>
                      {getCurrentPrompts().length} prompts available
                    </p></Transition>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {(
                    <div
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          refreshPrompts(activeTab, true);
                          toast.success('Prompts refreshed!');
                        }}
                        className={cn("h-9 w-9 rounded-full glass-shimmer hover:border-primary/50 transition-all z-20", workspaceUI && "ws-prompt-icon-button")}
                        title="Refresh prompts"
                        data-prompt-refresh
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>
                  )}

                  <div
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={onClose}
                      aria-label="Close prompt library"
                      className={cn("h-9 w-9 rounded-full glass-shimmer hover:border-destructive/50 transition-all z-20", workspaceUI && "ws-prompt-icon-button")}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Tab Navigation — three equal, color-coded pills spanning the sheet */}
              <div className={cn("px-6 sm:px-8 pt-5 pb-4 border-b border-border/20", workspaceUI && "ws-prompt-tabs-wrap")}>
                <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Prompt categories">
                  {tabs.map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        role="tab"
                        aria-selected={isActive}
                        className={cn(
                          "arc-prompt-press w-full py-2.5 px-2 rounded-2xl border text-center font-semibold transition-all duration-200",
                          "text-[13px] sm:text-sm tracking-wide",
                          isActive ? tab.activeClass : tab.idleClass,
                          workspaceUI && "ws-prompt-tab",
                        )}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Prompt Grid - beautiful cards with single scroll container */}
              <div 
                className={cn("flex-1 overflow-y-auto px-6 sm:px-8 pb-6", workspaceUI && "ws-prompt-list")}
                style={{ 
                  WebkitOverflowScrolling: 'touch',
                  touchAction: 'pan-y',
                  overscrollBehavior: 'contain',
                  willChange: 'scroll-position'
                }}
              >
                <SequencedTransition contentKey={activeTab} preset="fade" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 py-4">
                    {isCurrentTabLoading() ? (
                    <div className="col-span-full flex items-center justify-center py-16">
                      <Transition preset="modal"><div
                        className="flex flex-col items-center gap-4"
                      >
                        <div
                        >
                          <div className="arc-prompt-loading"><Lightbulb className="h-10 w-10 text-primary" /></div>
                        </div>
                        <p className="text-sm text-muted-foreground font-medium">
                          Generating fresh prompts...
                        </p>
                      </div></Transition>
                    </div>
                  ) : (
                    getCurrentPrompts().map((prompt, index) => (
                      <button
                        key={`${activeTab}-${index}-${prompt.label}`}
                        onClick={() => {
                          onSelectPrompt(prompt.prompt);
                          onClose();
                        }}
                        className={cn("arc-prompt-card arc-prompt-press group relative p-5 rounded-2xl backdrop-blur-xl bg-gradient-to-br from-background/80 to-background/60 border border-border/40 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5 text-left overflow-hidden", workspaceUI && "ws-prompt-option")}
                      >
                        {/* Gradient overlay on hover */}
                        <div
                          className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"

                        />

                        {/* Content */}
                        <span className="relative text-sm sm:text-base font-medium leading-relaxed block">
                          {prompt.label}
                        </span>

                        {/* Subtle shine effect */}
                        <div
                          className="absolute inset-0 opacity-0 group-hover:opacity-100"

                        >
                          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
                        </div>
                      </button>
                    ))
                  )}
                </SequencedTransition>
              </div>
            </div>
          </div></TransitionPart>
          </div>
      )}
    </ConditionalTransition>,
    document.body
  );
}
