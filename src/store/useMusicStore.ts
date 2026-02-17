import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface MusicTrack {
  id: string;
  name: string;
  previewName?: string; // Short name for pill display
  url: string;
  artist: string;
  albumArt: string;
}

const STORAGE_BASE = `${import.meta.env.VITE_SUPABASE_URL || "https://jxywhodnndagbsmnbnnw.supabase.co"}/storage/v1/object/public/music-files`;

export const musicTracks: MusicTrack[] = [
  { 
    id: 'lofi', 
    name: 'Lo-Fi Beats', 
    url: `${STORAGE_BASE}/lofi-beats-mix (1).mp3`,
    artist: 'Chill Collective',
    albumArt: '/lovable-uploads/lofi-cartoon-album.jpg'
  },
  { 
    id: 'jazz', 
    name: 'Coffee House Jazz', 
    url: `${STORAGE_BASE}/jazz-coffee-bar-music (1).mp3`,
    artist: 'Jazz Lounge',
    albumArt: '/lovable-uploads/jazz-cartoon-album.jpg'
  },
  { 
    id: 'ambient', 
    name: 'Space Ambient', 
    url: `${STORAGE_BASE}/pad-space-travel-hyperdrive-engine-humming-235901 (1).mp3`,
    artist: 'Cosmic Sounds',
    albumArt: '/lovable-uploads/ambient-cartoon-album.jpg'
  },
  { 
    id: 'taylor', 
    name: "The Best Day (Taylor's Version)", 
    previewName: 'The Best Day',
    url: `${STORAGE_BASE}/taylor-swift-the-best-day-taylors-version-official-music-video (1).mp3`,
    artist: 'Taylor Swift',
    albumArt: '/lovable-uploads/taylor-swift-album.jpg'
  },
  { 
    id: 'elevator', 
    name: 'Elevator Music', 
    url: '/audio/elevator-music.mp3',
    artist: 'Easy Listening',
    albumArt: '/lovable-uploads/elevator-music-album.jpg'
  },
  { 
    id: 'lionel', 
    name: 'Hello (Live)', 
    url: `${STORAGE_BASE}/lionel-richie-hello-live (1).mp3`,
    artist: 'Lionel Richie',
    albumArt: '/lovable-uploads/lionel-richie-album.jpg'
  }
];

interface MusicState {
  // Playback state
  isPlaying: boolean;
  volume: number;
  currentTrack: string;
  isMuted: boolean;
  currentTime: number;
  duration: number;
  isLoading: boolean;
  
  // Audio element reference
  audioRef: HTMLAudioElement | null;
  
  // Actions
  setAudioRef: (ref: HTMLAudioElement | null) => void;
  setIsPlaying: (playing: boolean) => void;
  setVolume: (volume: number) => void;
  setCurrentTrack: (trackId: string) => void;
  setIsMuted: (muted: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setIsLoading: (loading: boolean) => void;
  
  // Playback controls
  togglePlay: () => void;
  toggleMute: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  seek: (time: number) => void;
  handleVolumeChange: (volume: number) => void;
  handleTrackChange: (trackId: string) => void;
}

export const useMusicStore = create<MusicState>()(
  persist(
    (set, get) => ({
      // Initial state
      isPlaying: false,
      volume: 0.5,
      currentTrack: 'lofi',
      isMuted: false,
      currentTime: 0,
      duration: 0,
      isLoading: false,
      audioRef: null,
      
      // Setters
      setAudioRef: (ref) => set({ audioRef: ref }),
      setIsPlaying: (playing) => set({ isPlaying: playing }),
      setVolume: (volume) => set({ volume }),
      setCurrentTrack: (trackId) => set({ currentTrack: trackId }),
      setIsMuted: (muted) => set({ isMuted: muted }),
      setCurrentTime: (time) => set({ currentTime: time }),
      setDuration: (duration) => set({ duration }),
      setIsLoading: (loading) => set({ isLoading: loading }),
      
      // Playback controls
      togglePlay: () => {
        const { audioRef, isPlaying, setIsPlaying, setIsLoading } = get();
        if (!audioRef) return;
        
        if (isPlaying) {
          audioRef.pause();
          setIsPlaying(false);
        } else {
          setIsLoading(true);
          // Ensure source is loaded before playing
          if (audioRef.readyState >= 2) {
            audioRef.play()
              .then(() => { setIsPlaying(true); setIsLoading(false); })
              .catch(() => { setIsPlaying(false); setIsLoading(false); });
          } else {
            audioRef.load();
            audioRef.addEventListener('canplay', () => {
              audioRef.play()
                .then(() => { setIsPlaying(true); setIsLoading(false); })
                .catch(() => { setIsPlaying(false); setIsLoading(false); });
            }, { once: true });
          }
        }
      },
      
      toggleMute: () => {
        const { audioRef, isMuted, volume, setIsMuted } = get();
        if (!audioRef) return;
        
        const newMuted = !isMuted;
        setIsMuted(newMuted);
        audioRef.volume = newMuted ? 0 : volume;
      },
      
      nextTrack: () => {
        const { currentTrack, handleTrackChange } = get();
        const currentIndex = musicTracks.findIndex(t => t.id === currentTrack);
        const nextIndex = (currentIndex + 1) % musicTracks.length;
        handleTrackChange(musicTracks[nextIndex].id);
      },
      
      prevTrack: () => {
        const { currentTrack, handleTrackChange } = get();
        const currentIndex = musicTracks.findIndex(t => t.id === currentTrack);
        const prevIndex = currentIndex === 0 ? musicTracks.length - 1 : currentIndex - 1;
        handleTrackChange(musicTracks[prevIndex].id);
      },
      
      seek: (time: number) => {
        const { audioRef, duration } = get();
        if (!audioRef || !duration) return;
        
        // Just set audio currentTime - the timeupdate event will sync state
        audioRef.currentTime = time;
      },
      
      handleVolumeChange: (newVolume: number) => {
        const { audioRef, setVolume, setIsMuted } = get();
        setVolume(newVolume);
        setIsMuted(newVolume === 0);
        if (audioRef) {
          audioRef.volume = newVolume;
        }
      },
      
      handleTrackChange: (trackId: string) => {
        const { audioRef, isPlaying, setIsPlaying, setCurrentTrack, setCurrentTime } = get();
        const wasPlaying = isPlaying;
        setIsPlaying(false);
        setCurrentTrack(trackId);
        setCurrentTime(0);
        
        if (audioRef) {
          // Wait for React to update the src, then load and play
          requestAnimationFrame(() => {
            audioRef.load(); // Force reload with new src
            if (wasPlaying) {
              const playWhenReady = () => {
                audioRef.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
              };
              audioRef.addEventListener('canplay', playWhenReady, { once: true });
            }
          });
        }
      },
    }),
    {
      name: 'arc-music-storage',
      partialize: (state) => ({
        volume: state.volume,
        currentTrack: state.currentTrack,
        isMuted: state.isMuted,
      }),
    }
  )
);
