import { useState, useMemo, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { History, ChevronRight } from "lucide-react";
import { ThinkingIndicator } from "@/components/ThinkingIndicator";
import { SmartSuggestions } from "@/components/SmartSuggestions";
import { PromptLibrary } from "@/components/PromptLibrary";
import { ThemedLogo } from "@/components/ThemedLogo";
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
    if (hasTypedRef.current) {
      setDisplayedText(text);
      return;
    }
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
      }, 40);
      return () => clearInterval(interval);
    }, delay);

    return () => clearTimeout(startDelay);
  }, []);

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
  "Good morning.", "Rise and shine.", "Arc and shine.", "Wakey wakey.",
  "Morning, sunshine.", "You're up early.", "Bright and early, huh?",
  "Coffee time?", "Let's make today count.", "Fresh start incoming.",
  "New day, new arc.", "Ready to crush it?", "Time to be productive.",
  "The early bird gets the arc.", "Let's arc this day.", "Morning magic awaits.",
  "What are we building today?", "Another day, another arc.",
  "The world is your canvas.", "Let's get after it.", "Time to make things happen.",
];

const AFTERNOON_GREETINGS = [
  "Good afternoon.", "Hey there.", "Still going strong?", "Arc o'clock.",
  "Midday vibes.", "Hope you're crushing it.", "Afternoon energy.",
  "Peak productivity hours.", "Let's keep the momentum.", "Halfway through the day.",
  "What are we working on?", "Time flies when you're arcing.", "Staying focused?",
  "Power through mode activated.", "Coffee break or hustle?", "The grind continues.",
  "Making progress?", "Keep that flow going.", "Afternoon excellence.",
  "Let's finish strong.", "Ideas flowing?",
];

const EVENING_GREETINGS = [
  "Good evening.", "Hey night owl.", "Arc after dark.",
  "Burning the midnight oil?", "Late night energy.", "The night is young.",
  "Still at it?", "Evening grind.", "Moon's out, arc's out.",
  "Peak creative hours.", "Night mode activated.", "When everyone sleeps, you arc.",
  "Quiet hours, best hours.", "The evening shift.", "Late night brilliance.",
  "After hours excellence.", "Productivity knows no bedtime.",
  "Working late or starting early?", "Night time, right time.",
  "Dark mode detected.", "Let's make tonight count.",
];

function getDaypartGreetings(): string[] {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return MORNING_GREETINGS;
  else if (h >= 12 && h < 18) return AFTERNOON_GREETINGS;
  else return EVENING_GREETINGS;
}

// Cycling greeting component
function CyclingGreeting() {
  const [displayedText, setDisplayedText] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const greetings = useMemo(() => getDaypartGreetings(), []);

  useEffect(() => {
    const currentGreeting = greetings[currentIndex];
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    let cancelled = false;

    const scheduleTimeout = (callback: () => void, delay: number) => {
      if (cancelled) return;
      const id = setTimeout(callback, delay);
      timeouts.push(id);
    };

    let currentCharIndex = 0;

    const typeNextChar = () => {
      if (cancelled) return;
      if (currentCharIndex < currentGreeting.length) {
        currentCharIndex++;
        setDisplayedText(currentGreeting.slice(0, currentCharIndex));
        scheduleTimeout(typeNextChar, 40);
      } else {
        scheduleTimeout(startUntype, 8000);
      }
    };

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
          scheduleTimeout(() => {
            if (!cancelled) {
              setCurrentIndex((prev) => (prev + 1) % greetings.length);
            }
          }, 200);
        }
      };

      unTypeNextChar();
    };

    typeNextChar();

    return () => {
      cancelled = true;
      timeouts.forEach(clearTimeout);
    };
  }, [currentIndex, greetings]);

  return <>{displayedText}</>;
}

// Static general quick prompts - no AI, instant load
// Uses /write, /code, /image prefix commands where appropriate
const GENERAL_QUICK_PROMPTS = [
  { label: "💬 Let's chat", prompt: "Let's have a chat — what's going on in the world right now?" },
  { label: "💡 Brainstorm", prompt: "I need help brainstorming ideas. Let's think through something creative together." },
  { label: "✍️ Write together", prompt: "/write Open a blank canvas so we can work on writing something together!" },
  { label: "🎯 Plan my day", prompt: "Help me plan out my day and prioritize what matters most." },
  { label: "🧠 Explain a topic", prompt: "Pick a fascinating topic and explain it to me like I'm hearing it for the first time." },
  { label: "🎨 Create art", prompt: "/image Generate something beautiful — surprise me with a stunning visual." },
  { label: "📝 Draft an email", prompt: "/write Help me draft a professional email — open the canvas and let's work on it." },
  { label: "🎮 Build something", prompt: "Write me a fun interactive HTML/JS demo — surprise me with something cool!" },
  { label: "📖 Tell a story", prompt: "/write Open the canvas and let's write a short story together from scratch." },
  { label: "🔍 Research this", prompt: "I need you to research something for me. Let's dive deep into a topic." },
  { label: "🌟 Motivate me", prompt: "Give me a motivational boost — I need some energy and inspiration right now." },
  { label: "🎭 Role play", prompt: "Let's do a role play exercise — you pick the scenario and I'll jump in." },
  { label: "📊 Analyze data", prompt: "/code Help me build a quick data visualization or chart for some numbers I have." },
  { label: "🌍 World news", prompt: "What's happening in the world today? Give me a quick rundown of current events." },
  { label: "🎵 Recommend music", prompt: "Recommend me some music based on a vibe — I'm open to anything." },
  { label: "✨ Random fact", prompt: "Hit me with a random interesting fact I probably don't know." },
  { label: "🗺️ Travel ideas", prompt: "Help me brainstorm travel destinations — I need a vacation." },
  { label: "📚 Book recs", prompt: "Recommend me a book based on what I'm in the mood for right now." },
  { label: "🧩 Solve a puzzle", prompt: "Write me a fun interactive puzzle or brain teaser I can play — include the full HTML/JS!" },
  { label: "🎬 Movie night", prompt: "Help me pick a movie to watch tonight — ask me what I'm in the mood for." },
];

// Pick 3 random prompts, different each session
function pickRandomPrompts(count: number = 3) {
  const shuffled = [...GENERAL_QUICK_PROMPTS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
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
  onOpenHistory?: () => void;
  onSelectSession?: (sessionId: string) => void;
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
  onOpenHistory,
  onSelectSession,
}: WelcomeSectionProps) {
  const [showLibrary, setShowLibrary] = useState(false);

  // Static random prompts - picked once on mount, no AI call
  const staticSuggestions = useMemo(() => pickRandomPrompts(3), []);

  // Get recent sessions for "Pick up where you left off"
  const recentSessions = useMemo(() => {
    return chatSessions
      .filter(s => {
        const count = s.messageCount ?? s.messages?.length ?? 0;
        return count > 0 && s.title;
      })
      .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())
      .slice(0, 6); // Keep 6 for horizontal scroll
  }, [chatSessions]);

  return (
    <>
      <div className="flex flex-col items-center px-4 space-y-3 sm:space-y-4 w-full">
        {/* Hero Section */}
        <motion.div
          className="flex flex-col items-center gap-3 sm:gap-4 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1], delay: 0.1 }}
        >
          {heroAvatar && (
            <motion.div
              className="relative"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, y: [0, -8, 0] }}
              transition={{
                opacity: { duration: 0.6, ease: "easeOut" },
                y: { duration: 4, repeat: Infinity, ease: "easeInOut", delay: 0.8 }
              }}
            >
              <img src={heroAvatar} alt="Arc" className="h-24 w-24 rounded-full" />
              <motion.div
                className="absolute -inset-1 bg-primary/30 rounded-full blur-xl"
                animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.5, 0.3] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              />
            </motion.div>
          )}

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold relative">
            <span className="relative inline-block">
              <CyclingGreeting />
            </span>
          </h2>
        </motion.div>

        {/* Static Quick Prompts - instant, no loading */}
        <div className="w-full space-y-2">
          <SmartSuggestions
            suggestions={staticSuggestions}
            onSelectPrompt={onTriggerPrompt}
            onShowMore={() => setShowLibrary(true)}
          />
        </div>


        {(isLoading || isGeneratingImage) && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.3 }}
            className="mt-8"
          >
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
