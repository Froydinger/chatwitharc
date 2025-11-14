import { useState, useEffect, useRef } from "react";
import { X, History, Headphones, Image, Code } from "lucide-react";
import { Settings } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChatHistoryPanel } from "@/components/ChatHistoryPanel";
import { SettingsPanel } from "@/components/SettingsPanel";
import { MusicPlayerPanel } from "@/components/MusicPlayerPanel";
import { MediaLibraryPanel } from "@/components/MediaLibraryPanel";
import { CodeAppsPanel } from "@/components/CodeAppsPanel";
import { ExportPanel } from "@/components/ExportPanel";
import { cn } from "@/lib/utils";

const musicTracks = [
  { 
    id: 'lofi', 
    name: 'Lo-Fi Beats', 
    url: 'https://froydinger.com/wp-content/uploads/2025/03/lofi-beats-mix.mp3',
    artist: 'Chill Collective',
    albumArt: '/lovable-uploads/lofi-cartoon-album.jpg'
  },
  { 
    id: 'jazz', 
    name: 'Coffee House Jazz', 
    url: 'https://froydinger.com/wp-content/uploads/2025/05/jazz-coffee-bar-music.mp3',
    artist: 'Jazz Lounge',
    albumArt: '/lovable-uploads/jazz-cartoon-album.jpg'
  },
  { 
    id: 'ambient', 
    name: 'Space Ambient', 
    url: 'https://froydinger.com/wp-content/uploads/2025/05/pad-space-travel-hyperdrive-engine-humming-235901.mp3',
    artist: 'Cosmic Sounds',
    albumArt: '/lovable-uploads/ambient-cartoon-album.jpg'
  }
];

interface RightPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: "history" | "media" | "apps" | "music" | "settings";
  onTabChange: (tab: "history" | "media" | "apps" | "music" | "settings") => void;
}

export function RightPanel({ isOpen, onClose, activeTab, onTabChange }: RightPanelProps) {
  // Audio state management (persists across tab switches)
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(() => {
    const saved = localStorage.getItem('arcai-music-playing');
    return saved === 'true';
  });
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('arcai-music-volume');
    return saved ? parseFloat(saved) : 0.4;
  });
  const [currentTrack, setCurrentTrack] = useState(() => {
    const saved = localStorage.getItem('arcai-music-track');
    return saved || 'lofi';
  });
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => {
    const saved = localStorage.getItem('arcai-music-time');
    return saved ? parseFloat(saved) : 0;
  });
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Audio event handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = () => setIsPlaying(false);
    const handleError = () => {
      setIsPlaying(false);
      setIsLoading(false);
    };
    const handleTimeUpdate = () => {
      const time = audio.currentTime;
      setCurrentTime(time);
      localStorage.setItem('arcai-music-time', time.toString());
    };
    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      setIsLoading(false);
      const savedTime = localStorage.getItem('arcai-music-time');
      if (savedTime) {
        audio.currentTime = parseFloat(savedTime);
      }
      if (isPlaying) {
        audio.play().catch(() => setIsPlaying(false));
      }
    };
    const handleLoadStart = () => setIsLoading(true);
    const handleCanPlay = () => setIsLoading(false);

    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('loadstart', handleLoadStart);
    audio.addEventListener('canplay', handleCanPlay);
    audio.volume = isMuted ? 0 : volume;

    return () => {
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('loadstart', handleLoadStart);
      audio.removeEventListener('canplay', handleCanPlay);
    };
  }, [volume, isMuted, currentTrack, isPlaying]);

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem('arcai-music-volume', volume.toString());
  }, [volume]);

  useEffect(() => {
    localStorage.setItem('arcai-music-track', currentTrack);
  }, [currentTrack]);

  useEffect(() => {
    localStorage.setItem('arcai-music-playing', isPlaying.toString());
  }, [isPlaying]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  const getCurrentTrack = () => musicTracks.find(t => t.id === currentTrack) || musicTracks[0];
  const track = getCurrentTrack();

  return (
    <>
      {/* Mobile backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      {/* Panel - snappy with rebound like pulling out a physical shelf */}
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: isOpen ? "0%" : "100%" }}
        transition={{ type: "spring", damping: 18, stiffness: 320, mass: 0.65 }}
        className={cn(
          "fixed top-0 right-0 h-full z-50 backdrop-blur-2xl bg-background/50 border-l border-border/30",
          "w-full sm:w-96 lg:w-80 xl:w-96",
          "flex flex-col overflow-hidden shadow-2xl"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/30 backdrop-blur-xl bg-background/40">
          <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as any)} className="flex-1">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="history" className="flex items-center justify-center">
                <History className="h-4 w-4" />
              </TabsTrigger>
              <TabsTrigger value="media" className="flex items-center justify-center">
                <Image className="h-4 w-4" />
              </TabsTrigger>
              <TabsTrigger value="apps" className="flex items-center justify-center">
                <Code className="h-4 w-4" />
              </TabsTrigger>
              <TabsTrigger value="music" className="flex items-center justify-center">
                <Headphones className="h-4 w-4" />
              </TabsTrigger>
              <TabsTrigger value="settings" className="flex items-center justify-center">
                <Settings className="h-4 w-4" />
              </TabsTrigger>
            </TabsList>
          </Tabs>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="ml-2 rounded-full"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          <Tabs value={activeTab} className="h-full">
            <TabsContent value="history" className="h-full m-0">
              <ChatHistoryPanel />
            </TabsContent>
            
            <TabsContent value="media" className="h-full m-0">
              <MediaLibraryPanel />
            </TabsContent>

            <TabsContent value="apps" className="h-full m-0">
              <CodeAppsPanel />
            </TabsContent>
            
            <TabsContent value="music" className="h-full m-0">
              <MusicPlayerPanel
                audioRef={audioRef}
                isPlaying={isPlaying}
                setIsPlaying={setIsPlaying}
                volume={volume}
                setVolume={setVolume}
                currentTrack={currentTrack}
                setCurrentTrack={setCurrentTrack}
                isMuted={isMuted}
                setIsMuted={setIsMuted}
                currentTime={currentTime}
                setCurrentTime={setCurrentTime}
                duration={duration}
                isLoading={isLoading}
              />
            </TabsContent>
            
            <TabsContent value="settings" className="h-full m-0">
              <SettingsPanel />
            </TabsContent>

            <TabsContent value="export" className="h-full m-0">
              <ExportPanel />
            </TabsContent>
          </Tabs>
        </div>

        {/* Audio element - persists across all tabs */}
        <audio
          ref={audioRef}
          src={track.url}
          loop
          preload="metadata"
        />
      </motion.div>
    </>
  );
}