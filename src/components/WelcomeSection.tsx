import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { RefreshCw } from "lucide-react";
import { ThinkingIndicator } from "@/components/ThinkingIndicator";
import { SmartSuggestions } from "@/components/SmartSuggestions";
import { PromptLibrary } from "@/components/PromptLibrary";
import { selectSmartPrompts, QuickPrompt } from "@/utils/smartPrompts";
import { Profile } from "@/hooks/useProfile";
import { ChatSession } from "@/store/useArcStore";
import { Button } from "@/components/ui/button";

interface WelcomeSectionProps {
  greeting: string;
  heroAvatar: string | null;
  quickPrompts: { label: string; prompt: string }[];
  onTriggerPrompt: (prompt: string) => void;
  profile: Profile | null;
  chatSessions: ChatSession[];
  isLoading?: boolean;
  isGeneratingImage?: boolean;
}

export function WelcomeSection({
  greeting,
  heroAvatar,
  quickPrompts,
  onTriggerPrompt,
  profile,
  chatSessions,
  isLoading = false,
  isGeneratingImage = false,
}: WelcomeSectionProps) {
  const [showLibrary, setShowLibrary] = useState(false);
  const [smartSuggestions, setSmartSuggestions] = useState<QuickPrompt[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Convert prompts to categorized format
  const categorizedPrompts: QuickPrompt[] = useMemo(() => {
    return quickPrompts.map((p, index) => ({
      ...p,
      category: index < 6 ? "chat" : index < 12 ? "create" : index < 18 ? "write" : "code",
    }));
  }, [quickPrompts]);

  // Smart prompt selection with AI personalization
  useEffect(() => {
    let isMounted = true;

    const loadSmartSuggestions = async (skipCache = false) => {
      setIsLoadingSuggestions(true);
      try {
        const suggestions = await selectSmartPrompts(categorizedPrompts, profile, chatSessions, 3, skipCache);
        if (isMounted) {
          setSmartSuggestions(suggestions);
        }
      } catch (error) {
        console.error("Failed to load smart suggestions:", error);
        // Fallback to first 3 prompts
        if (isMounted) {
          setSmartSuggestions(categorizedPrompts.slice(0, 3));
        }
      } finally {
        if (isMounted) {
          setIsLoadingSuggestions(false);
        }
      }
    };

    loadSmartSuggestions();

    return () => {
      isMounted = false;
    };
  }, [categorizedPrompts, profile, chatSessions]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const suggestions = await selectSmartPrompts(categorizedPrompts, profile, chatSessions, 3, true);
      setSmartSuggestions(suggestions);
    } catch (error) {
      console.error("Failed to refresh suggestions:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Parse greeting to separate time greeting from name
  const parseGreeting = (greetingText: string) => {
    const parts = greetingText.split(", ");
    if (parts.length === 2) {
      return { timeGreeting: parts[0], name: parts[1] };
    }
    return { timeGreeting: greetingText, name: null };
  };

  const { timeGreeting, name } = parseGreeting(greeting);

  return (
    <>
      <div className="flex flex-col items-center justify-start min-h-full py-12 px-4 space-y-6">
        {/* Hero Section */}
        <motion.div
          className="flex flex-col items-center gap-6 text-center mt-16"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          {/* Avatar - only render if heroAvatar is provided */}
          {heroAvatar && (
            <motion.div
              className="relative"
              animate={{
                y: [0, -8, 0],
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <img src={heroAvatar} alt="Arc" className="h-24 w-24 rounded-full" />
              <motion.div
                className="absolute -inset-1 bg-primary/30 rounded-full blur-xl"
                animate={{
                  scale: [1, 1.1, 1],
                  opacity: [0.3, 0.5, 0.3],
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
            </motion.div>
          )}

          {/* Greeting with glow and accent-colored name */}
          <motion.h2
            className="text-4xl font-semibold relative"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <span className="relative inline-block">
              {timeGreeting}
              {name && (
                <>
                  <span>, </span>
                  <span className="text-primary relative inline-block">
                    {name}
                    {/* Bright glow effect for name */}
                    <motion.span
                      className="absolute inset-0 text-primary blur-lg"
                      style={{
                        filter: "blur(16px)",
                        opacity: 0.7,
                      }}
                      animate={{
                        opacity: [0.5, 0.9, 0.5],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    >
                      {name}
                    </motion.span>
                    {/* Extra bright core glow */}
                    <motion.span
                      className="absolute inset-0 text-primary blur-md"
                      style={{
                        filter: "blur(8px)",
                        opacity: 0.6,
                      }}
                      animate={{
                        opacity: [0.4, 0.8, 0.4],
                      }}
                      transition={{
                        duration: 2.5,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    >
                      {name}
                    </motion.span>
                  </span>
                </>
              )}
            </span>
          </motion.h2>

          <motion.p
            className="text-muted-foreground text-lg max-w-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            What would you like to explore today?
          </motion.p>
        </motion.div>

        {/* Smart Suggestions */}
        {isLoadingSuggestions ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="flex flex-col items-center gap-3 mt-4"
          >
            <motion.div
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              className="relative"
            >
              <img src="/arc-logo-ui.png" alt="Loading" className="h-10 w-10 logo-accent-glow" />
              <motion.div
                className="absolute inset-0 rounded-full bg-primary/30 blur-xl"
                animate={{ 
                  scale: [0.8, 1.2, 0.8],
                  opacity: [0.3, 0.6, 0.3]
                }}
                transition={{ 
                  duration: 1.5, 
                  repeat: Infinity, 
                  ease: "easeInOut" 
                }}
              />
            </motion.div>
            <p className="text-sm text-muted-foreground">Personalizing prompts for you...</p>
          </motion.div>
        ) : (
          smartSuggestions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="w-full space-y-2"
            >
              {/* Refresh Button */}
              <div className="flex justify-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  <RefreshCw className={`h-3 w-3 ${isRefreshing ? "animate-spin" : ""}`} />
                </Button>
              </div>

              <SmartSuggestions
                suggestions={smartSuggestions}
                onSelectPrompt={onTriggerPrompt}
                onShowMore={() => setShowLibrary(true)}
              />
            </motion.div>
          )
        )}

        {/* Thinking Indicator */}
        {(isLoading || isGeneratingImage) && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-8">
            <ThinkingIndicator isLoading={isLoading} isGeneratingImage={isGeneratingImage} />
          </motion.div>
        )}
      </div>

      {/* Prompt Library Drawer */}
      <PromptLibrary
        isOpen={showLibrary}
        onClose={() => setShowLibrary(false)}
        prompts={quickPrompts}
        onSelectPrompt={onTriggerPrompt}
      />
    </>
  );
}
