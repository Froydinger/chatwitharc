import { useState, useMemo, useEffect, useRef } from "react";
import { motion, useAnimation } from "framer-motion";
import { RefreshCw } from "lucide-react";
import { ThinkingIndicator } from "@/components/ThinkingIndicator";
import { SmartSuggestions } from "@/components/SmartSuggestions";
import { PromptLibrary } from "@/components/PromptLibrary";
import { ThemedLogo } from "@/components/ThemedLogo";
import { selectSmartPrompts, QuickPrompt } from "@/utils/smartPrompts";
import { Profile } from "@/hooks/useProfile";
import { ChatSession } from "@/store/useArcStore";
import { Button } from "@/components/ui/button";

// Typewriter component for smooth text reveal - plays once only
function TypewriterText({ text, delay = 0, onComplete }: { text: string; delay?: number; onComplete?: () => void }) {
  const [displayedText, setDisplayedText] = useState("");
  const hasTypedRef = useRef(false);
  const indexRef = useRef(0);
  const textRef = useRef(text);

  useEffect(() => {
    // Only type once - never repeat
    if (hasTypedRef.current) {
      setDisplayedText(text);
      return;
    }

    // Store the text we're typing
    textRef.current = text;
    setDisplayedText("");
    indexRef.current = 0;

    const startDelay = setTimeout(() => {
      const interval = setInterval(() => {
        if (indexRef.current < textRef.current.length) {
          setDisplayedText(textRef.current.slice(0, indexRef.current + 1));
          indexRef.current++;
        } else {
          clearInterval(interval);
          hasTypedRef.current = true;
          if (onComplete) onComplete();
        }
      }, 40); // 40ms per character for smooth typing

      return () => clearInterval(interval);
    }, delay);

    return () => clearTimeout(startDelay);
  }, []); // Only run once on mount

  // If text changes after typing started, just update displayed text
  useEffect(() => {
    if (hasTypedRef.current && text !== textRef.current) {
      setDisplayedText(text);
      textRef.current = text;
    }
  }, [text]);

  return <>{displayedText}</>;
}

// Time-based snarky greetings
const MORNING_GREETINGS = [
  "Good morning.",
  "Rise and shine.",
  "Arc and shine.",
  "Wakey wakey.",
  "Morning, sunshine.",
  "You're up early.",
  "Bright and early, huh?",
  "Coffee time?",
  "Let's make today count.",
  "Fresh start incoming.",
  "New day, new arc.",
  "Ready to crush it?",
  "Time to be productive.",
  "The early bird gets the arc.",
  "Let's arc this day.",
  "Morning magic awaits.",
  "What are we building today?",
  "Another day, another arc.",
  "The world is your canvas.",
  "Let's get after it.",
  "Time to make things happen.",
];

const AFTERNOON_GREETINGS = [
  "Good afternoon.",
  "Hey there.",
  "Still going strong?",
  "Arc o'clock.",
  "Midday vibes.",
  "Hope you're crushing it.",
  "Afternoon energy.",
  "Peak productivity hours.",
  "Let's keep the momentum.",
  "Halfway through the day.",
  "What are we working on?",
  "Time flies when you're arcing.",
  "Staying focused?",
  "Power through mode activated.",
  "Coffee break or hustle?",
  "The grind continues.",
  "Making progress?",
  "Keep that flow going.",
  "Afternoon excellence.",
  "Let's finish strong.",
  "Ideas flowing?",
];

const EVENING_GREETINGS = [
  "Good evening.",
  "Hey night owl.",
  "Arc after dark.",
  "Burning the midnight oil?",
  "Late night energy.",
  "The night is young.",
  "Still at it?",
  "Evening grind.",
  "Moon's out, arc's out.",
  "Peak creative hours.",
  "Night mode activated.",
  "When everyone sleeps, you arc.",
  "Quiet hours, best hours.",
  "The evening shift.",
  "Late night brilliance.",
  "After hours excellence.",
  "Productivity knows no bedtime.",
  "Working late or starting early?",
  "Night time, right time.",
  "Dark mode detected.",
  "Let's make tonight count.",
];

// Get greetings for current time of day
function getDaypartGreetings(): string[] {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) {
    return MORNING_GREETINGS;
  } else if (h >= 12 && h < 18) {
    return AFTERNOON_GREETINGS;
  } else {
    return EVENING_GREETINGS;
  }
}

// Cycling greeting component - types, pauses, un-types, then cycles to next
function CyclingGreeting() {
  const [displayedText, setDisplayedText] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const greetings = useMemo(() => getDaypartGreetings(), []);

  // Main animation effect - type, pause, untype, cycle
  useEffect(() => {
    const currentGreeting = greetings[currentIndex];
    const timeouts: NodeJS.Timeout[] = [];
    let cancelled = false;

    const scheduleTimeout = (callback: () => void, delay: number) => {
      if (cancelled) return;
      const id = setTimeout(callback, delay);
      timeouts.push(id);
    };

    let currentCharIndex = 0;

    // Phase 1: Type the greeting character by character
    const typeNextChar = () => {
      if (cancelled) return;
      if (currentCharIndex < currentGreeting.length) {
        currentCharIndex++;
        setDisplayedText(currentGreeting.slice(0, currentCharIndex));
        scheduleTimeout(typeNextChar, 40);
      } else {
        // Done typing, move to pause phase
        scheduleTimeout(startUntype, 3000);
      }
    };

    // Phase 2: Un-type the greeting character by character
    const startUntype = () => {
      if (cancelled) return;
      let unTypeIndex = currentGreeting.length;

      const unTypeNextChar = () => {
        if (cancelled) return;
        if (unTypeIndex > 0) {
          unTypeIndex--;
          setDisplayedText(currentGreeting.slice(0, unTypeIndex));
          scheduleTimeout(unTypeNextChar, 30);
        } else {
          // Done un-typing, move to next greeting after brief pause
          scheduleTimeout(() => {
            if (!cancelled) {
              setCurrentIndex((prev) => (prev + 1) % greetings.length);
            }
          }, 200);
        }
      };

      unTypeNextChar();
    };

    // Start the animation
    typeNextChar();

    // Cleanup function
    return () => {
      cancelled = true;
      timeouts.forEach(clearTimeout);
    };
  }, [currentIndex, greetings]);

  return <>{displayedText}</>;
}

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
  const [smartSuggestions, setSmartSuggestions] = useState<QuickPrompt[] | null>(null);
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

        // Filter out the specific prompts that cause blips
        const excludedLabels = ["💭 Reflect", "🙏 Gratitude", "🎨 Dream Poster"];
        const filtered = suggestions.filter(s => !excludedLabels.includes(s.label));

        if (isMounted) {
          setSmartSuggestions(filtered);
          setIsLoadingSuggestions(false);
        }
      } catch (error) {
        console.error("Failed to load smart suggestions:", error);
        // On error, keep showing loading state - don't show temporary prompts
        // This prevents the "blip" of non-AI prompts appearing
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

      // Filter out the specific prompts that cause blips
      const excludedLabels = ["💭 Reflect", "🙏 Gratitude", "🎨 Dream Poster"];
      const filtered = suggestions.filter(s => !excludedLabels.includes(s.label));

      setSmartSuggestions(filtered);
      setIsRefreshing(false);
    } catch (error) {
      console.error("Failed to refresh suggestions:", error);
      // On error, keep showing loading state - don't show temporary prompts
      // This prevents the "blip" of non-AI prompts appearing
    }
  };

  return (
    <>
      <div className="flex flex-col items-center justify-start min-h-full py-12 px-4 space-y-6">
        {/* Hero Section */}
        <motion.div
          className="flex flex-col items-center gap-6 text-center mt-16"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1], delay: 0.1 }}
        >
          {/* Avatar - only render if heroAvatar is provided */}
          {heroAvatar && (
            <motion.div
              className="relative"
              initial={{ opacity: 0 }}
              animate={{
                opacity: 1,
                y: [0, -8, 0]
              }}
              transition={{
                opacity: { duration: 0.6, ease: "easeOut" },
                y: {
                  duration: 4,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: 0.8
                }
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

          {/* Cycling greeting with type/untype animation - time-based snarky greetings */}
          <h2 className="text-4xl font-semibold relative">
            <span className="relative inline-block">
              <CyclingGreeting />
            </span>
          </h2>
        </motion.div>

        {/* Smart Suggestions or Loading State */}
        {isLoadingSuggestions || isRefreshing || !smartSuggestions || smartSuggestions.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="flex flex-col items-center gap-3 mt-4"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{
                opacity: 1,
                scale: [1, 1.15, 1]
              }}
              transition={{
                opacity: { duration: 0.4, ease: "easeOut" },
                scale: { duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: 0.4 }
              }}
              className="relative"
            >
              <ThemedLogo className="h-10 w-10 logo-accent-glow" alt="Loading" />
              <motion.div
                className="absolute inset-0 rounded-full bg-primary/30 blur-xl"
                initial={{ opacity: 0 }}
                animate={{
                  opacity: [0.3, 0.6, 0.3],
                  scale: [0.8, 1.2, 0.8]
                }}
                transition={{
                  opacity: { duration: 0.4, ease: "easeOut" },
                  scale: { duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: 0.4 }
                }}
              />
            </motion.div>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="text-sm text-muted-foreground"
            >
              {isRefreshing ? "Refreshing suggestions..." : "Personalizing prompts for you..."}
            </motion.p>
          </motion.div>
        ) : (
          smartSuggestions.length > 0 && (
            <div className="w-full space-y-2">
              {/* Refresh Button */}
              <div className="flex justify-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <RefreshCw className={`h-3 w-3 transition-transform ${isRefreshing ? "animate-spin" : ""}`} />
                </Button>
              </div>

              <SmartSuggestions
                suggestions={smartSuggestions}
                onSelectPrompt={onTriggerPrompt}
                onShowMore={() => setShowLibrary(true)}
              />
            </div>
          )
        )}

        {(isLoading || isGeneratingImage) && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }} 
            animate={{ opacity: 1, scale: 1 }} 
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.3 }}
            className="mt-8"
          >
            <ThinkingIndicator 
              isLoading={isLoading} 
              isGeneratingImage={isGeneratingImage}
            />
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
