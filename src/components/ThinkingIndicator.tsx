import { useState, useEffect, useRef } from "react";
import { Sparkles, Music } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ThemedLogo } from "@/components/ThemedLogo";
import { ThinkingOrb } from "thinking-orbs";

interface ThinkingIndicatorProps {
  isLoading: boolean;
  isGeneratingImage: boolean;
  accessingMemory?: boolean;
  searchingChats?: boolean;
  searchingWeb?: boolean;
  fullSize?: boolean;
}

/**
 * Resolve the app's active theme to a concrete "dark" | "light".
 *
 * We hand this to <ThinkingOrb theme=...> instead of "auto" on purpose: in
 * "auto" mode the orb installs its own MutationObserver on documentElement with
 * `subtree: true`, so its theme-recompute callback fires on EVERY class change
 * anywhere in the document. During a streaming response the app mutates classes
 * constantly (Framer Motion, hover pulses, the rotating pun text), and each one
 * runs that callback on the main thread — stealing frames from the orb's canvas
 * loop and producing the periodic "blip" during steady thinking. Passing a fixed
 * theme skips the observer entirely; here we watch only the root's own class
 * attribute (no subtree) so theme switches still update instantly without the
 * per-mutation cost.
 */
function useResolvedOrbTheme(): "dark" | "light" {
  const [theme, setTheme] = useState<"dark" | "light">(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("light")
      ? "light"
      : "dark"
  );

  useEffect(() => {
    const root = document.documentElement;
    const read = () => setTheme(root.classList.contains("light") ? "light" : "dark");
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return theme;
}

const ARC_PUNS = [
  "Arc is thinking...",
  "Arc is arcing around...",
  "Just arcing it...",
  "Arcing through ideas...",
  "Following the arc...",
  "Arc-ing up a response...",
  "Making an arc-gument...",
  "Arc-hitecting a reply...",
  "Arc-ticulating thoughts...",
  "Arc and rolling...",
];

export function ThinkingIndicator({ isLoading, isGeneratingImage, accessingMemory, searchingChats, searchingWeb, fullSize }: ThinkingIndicatorProps) {
  const showThinking = isLoading || isGeneratingImage || accessingMemory || searchingChats || searchingWeb;
  const [currentPunIndex, setCurrentPunIndex] = useState(0);
  const [showMusicButton, setShowMusicButton] = useState(false);
  const [showHangTight, setShowHangTight] = useState(false);
  const [isPlayingMusic, setIsPlayingMusic] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const thinkingStartTime = useRef<number | null>(null);

  // Show the music button after 3s, and a "hang tight" note after 60s so the
  // user knows a slow write/code generation is still going (the stream now
  // waits up to 240s before giving up).
  useEffect(() => {
    if (showThinking) {
      thinkingStartTime.current = Date.now();
      setShowMusicButton(false);
      setShowHangTight(false);

      const musicTimer = setTimeout(() => setShowMusicButton(true), 3000);
      const hangTightTimer = setTimeout(() => setShowHangTight(true), 60000);

      return () => {
        clearTimeout(musicTimer);
        clearTimeout(hangTightTimer);
      };
    } else {
      // Reset when thinking stops
      setShowMusicButton(false);
      setShowHangTight(false);
      thinkingStartTime.current = null;
    }
  }, [showThinking]);

  // Cleanup audio when thinking ends - always stop music when AI responds
  useEffect(() => {
    if (!showThinking) {
      // Always cleanup when thinking stops, regardless of audioRef state
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current = null;
      }
      setIsPlayingMusic(false);
    }

    // Also cleanup on component unmount
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current = null;
      }
    };
  }, [showThinking]);

  const handlePlayMusic = () => {
    if (isPlayingMusic && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
      setIsPlayingMusic(false);
    } else {
      const audio = new Audio('/audio/elevator-music.mp3');
      audio.loop = true;
      audio.volume = 0.3;
      audioRef.current = audio;
      audio.play().catch(() => {
        // Autoplay may be blocked
      });
      setIsPlayingMusic(true);
    }
  };

  // Rotate through puns every 2 seconds when thinking
  useEffect(() => {
    if (!showThinking || isGeneratingImage || searchingChats || accessingMemory || searchingWeb) return;

    const interval = setInterval(() => {
      setCurrentPunIndex((prev) => (prev + 1) % ARC_PUNS.length);
    }, 2000);

    return () => clearInterval(interval);
  }, [showThinking, isGeneratingImage, searchingChats, accessingMemory, searchingWeb]);

  // Reset to first pun when thinking starts
  useEffect(() => {
    if (showThinking && isLoading && !isGeneratingImage && !searchingChats && !accessingMemory && !searchingWeb) {
      setCurrentPunIndex(0);
    }
  }, [showThinking, isLoading, isGeneratingImage, searchingChats, accessingMemory, searchingWeb]);

  if (!showThinking) return null;

  const getMessage = () => {
    if (isGeneratingImage) return "Creating your image";
    if (searchingWeb) return "Searching the web...";
    if (searchingChats) return "Searching past chats...";
    if (accessingMemory) return "Accessing memories...";
    return ARC_PUNS[currentPunIndex];
  };

  const orbState = searchingWeb || searchingChats ? "searching" : "listening";
  const orbTheme = useResolvedOrbTheme();

  // Full-size loader for image generation
  if (fullSize && isGeneratingImage) {
    return (
      <motion.div
        className="w-full max-w-sm mx-auto bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden flex items-center justify-center"
        style={{ aspectRatio: '1 / 1', minHeight: '320px' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        <div className="flex flex-col items-center gap-6 p-8">
          <div className="relative flex items-center justify-center" style={{ willChange: 'transform' }}>
            <motion.div
              className="h-24 w-24 animate-spin-slow"
              style={{
                backfaceVisibility: 'hidden',
                transform: 'translateZ(0)',
                willChange: 'transform'
              }}
              initial={{ opacity: 0 }}
              animate={{
                opacity: 1
              }}
              transition={{
                opacity: { duration: 0.4, ease: "easeOut" }
              }}
            >
              <ThemedLogo className="h-full w-full opacity-90" alt="Generating" />
            </motion.div>
            <motion.div
              className="absolute inset-0 rounded-full bg-primary/20"
              style={{
                filter: 'blur(32px)',
                backfaceVisibility: 'hidden',
                transform: 'translateZ(0)',
                willChange: 'transform, opacity'
              }}
              initial={{ opacity: 0 }}
              animate={{
                scale: [0.8, 1.3, 0.8],
                opacity: [0.2, 0.5, 0.2]
              }}
              transition={{
                opacity: { duration: 0.4, ease: "easeOut" },
                scale: { duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.4 }
              }}
            />
          </div>
          <motion.span
            className="text-xl font-semibold text-foreground/90 tracking-tight"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {getMessage()}
          </motion.span>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="flex flex-col items-start gap-2"
      initial={{ opacity: 0, y: 14, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 320, damping: 15, mass: 0.6 }}
    >
      <div 
        className="inline-flex items-center gap-2.5 px-5 py-3 rounded-2xl bg-muted/50 border border-border/40 backdrop-blur-sm"
        aria-live="polite"
      >
        <div className="relative flex h-10 w-10 items-center justify-center">
          <ThinkingOrb
            state={orbState}
            size={64}
            speed={0.75}
            theme={orbTheme}
            aria-label={orbState === "searching" ? "Arc is searching" : "Arc is thinking"}
            className="h-10 w-10"
            style={{ width: 40, height: 40 }}
          />
          <div className="absolute inset-1 -z-10 rounded-full bg-primary/25 blur-xl" aria-hidden="true" />
        </div>
        <div className="relative flex items-center min-w-0">
          <AnimatePresence mode="wait">
            <motion.span
              key={getMessage()}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.3 }}
              className="text-sm font-medium text-foreground/80 whitespace-nowrap"
            >
              {getMessage()}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>
      
      {/* Music button - appears after 3 seconds */}
      <AnimatePresence>
        {showMusicButton && (
          <motion.button
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.2 }}
            onClick={handlePlayMusic}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors ml-1"
          >
            <Music className="h-3 w-3" />
            <span>{isPlayingMusic ? "stop the tunes" : "taking too long? listen to some tunes"}</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Reassurance note - appears after 60 seconds of a slow generation */}
      <AnimatePresence>
        {showHangTight && (
          <motion.span
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="text-[10px] text-muted-foreground/70 ml-1"
          >
            hang tight, Arc is still thinking...
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
