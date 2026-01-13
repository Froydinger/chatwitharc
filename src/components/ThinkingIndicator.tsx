import { useState, useEffect, useRef } from "react";
import { Sparkles, Music } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ThemedLogo } from "@/components/ThemedLogo";

interface ThinkingIndicatorProps {
  isLoading: boolean;
  isGeneratingImage: boolean;
  accessingMemory?: boolean;
  searchingChats?: boolean;
  searchingWeb?: boolean;
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

export function ThinkingIndicator({ isLoading, isGeneratingImage, accessingMemory, searchingChats, searchingWeb }: ThinkingIndicatorProps) {
  const showThinking = isLoading || isGeneratingImage || accessingMemory || searchingChats || searchingWeb;
  const [currentPunIndex, setCurrentPunIndex] = useState(0);
  const [showMusicButton, setShowMusicButton] = useState(false);
  const [isPlayingMusic, setIsPlayingMusic] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const thinkingStartTime = useRef<number | null>(null);

  // Show music button after 3 seconds of thinking
  useEffect(() => {
    if (showThinking) {
      thinkingStartTime.current = Date.now();
      setShowMusicButton(false);
      
      const timer = setTimeout(() => {
        setShowMusicButton(true);
      }, 3000);

      return () => clearTimeout(timer);
    } else {
      // Reset when thinking stops
      setShowMusicButton(false);
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
    if (isGeneratingImage) return "Generating image...";
    if (searchingWeb) return "Searching the web...";
    if (searchingChats) return "Searching past chats...";
    if (accessingMemory) return "Accessing memories...";
    return ARC_PUNS[currentPunIndex];
  };
  
  return (
    <motion.div 
      className="flex flex-col items-start gap-2"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.2 }}
    >
      <div 
        className="inline-flex items-center gap-2.5 px-5 py-3 rounded-2xl bg-muted/50 border border-border/40 backdrop-blur-sm"
        aria-live="polite"
      >
        <div className="relative flex items-center justify-center" style={{ willChange: 'transform' }}>
          <motion.div
            className="h-10 w-10"
            style={{
              backfaceVisibility: 'hidden',
              transform: 'translateZ(0)',
              willChange: 'transform'
            }}
            initial={{ opacity: 0 }}
            animate={{
              opacity: 1,
              scale: [1, 1.15, 1]
            }}
            transition={{
              opacity: { duration: 0.4, ease: "easeOut" },
              scale: { duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: 0.4 }
            }}
          >
            <ThemedLogo className="h-full w-full" alt="Thinking" />
          </motion.div>
          <motion.div
            className="absolute inset-0 rounded-full bg-primary/30"
            style={{
              filter: 'blur(16px)',
              backfaceVisibility: 'hidden',
              transform: 'translateZ(0)',
              willChange: 'transform, opacity'
            }}
            initial={{ opacity: 0 }}
            animate={{
              scale: [0.8, 1.2, 0.8],
              opacity: [0.3, 0.6, 0.3]
            }}
            transition={{
              opacity: { duration: 0.4, ease: "easeOut" },
              scale: { duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: 0.4 }
            }}
          />
          <motion.div
            className="absolute -top-1 -right-1"
            style={{ 
              backfaceVisibility: 'hidden',
              transform: 'translateZ(0)',
              willChange: 'transform, opacity'
            }}
            animate={{ 
              scale: [0, 1, 0],
              opacity: [0, 1, 0]
            }}
            transition={{ 
              duration: 1.5,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          >
            <Sparkles className="h-3 w-3 text-primary" />
          </motion.div>
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
    </motion.div>
  );
}
