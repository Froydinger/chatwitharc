import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface MusicTrack {
  id: string;
  name: string;
  url: string;
  artist: string;
  albumArt: string;
}

export const musicTracks: MusicTrack[] = [
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
        const { audioRef, isPlaying, setIsPlaying } = get();
        if (!audioRef) return;
        
        if (isPlaying) {
          audioRef.pause();
          setIsPlaying(false);
        } else {
          audioRef.play().catch(() => setIsPlaying(false));
          setIsPlaying(true);
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
        const { audioRef, duration, setCurrentTime } = get();
        if (!audioRef || !duration) return;
        
        audioRef.currentTime = time;
        setCurrentTime(time);
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
        
        if (wasPlaying && audioRef) {
          setTimeout(() => {
            audioRef.currentTime = 0;
            audioRef.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
          }, 100);
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
