import { motion, AnimatePresence } from "framer-motion";
import { X, Mic, MicOff, Volume2, Loader2, ImageIcon, Search, Hand, Ear, Camera, CameraOff, Paperclip, SwitchCamera } from "lucide-react";
import { useVoiceModeStore } from "@/store/useVoiceModeStore";
import { useMusicStore } from "@/store/useMusicStore";
import { useCallback, useRef, useEffect, useMemo } from "react";

// Global ref to allow interrupt from overlay - set by VoiceModeController
let globalInterruptHandler: (() => void) | null = null;
// Global ref for mute-handoff (commit audio and get response when user mutes after speaking)
let globalMuteHandoffHandler: (() => boolean) | null = null;
// Global ref for camera video element - set by VoiceModeController
let globalVideoRef: React.RefObject<HTMLVideoElement> | null = null;
// Global ref for camera switch handler
let globalSwitchCameraHandler: (() => void) | null = null;

export function setGlobalInterruptHandler(handler: (() => void) | null) {
  globalInterruptHandler = handler;
}

export function setGlobalMuteHandoffHandler(handler: (() => boolean) | null) {
  globalMuteHandoffHandler = handler;
}

export function setGlobalVideoRef(ref: React.RefObject<HTMLVideoElement> | null) {
  globalVideoRef = ref;
}

export function setGlobalSwitchCameraHandler(handler: (() => void) | null) {
  globalSwitchCameraHandler = handler;
}

// Waveform bar component for the audio visualizer
function WaveformBar({ index, total, amplitude, status, isMuted }: {
  index: number;
  total: number;
  amplitude: number;
  status: string;
  isMuted: boolean;
}) {
  const minHeight = 4;
  const maxHeight = 80;
  
  const center = total / 2;
  const distFromCenter = Math.abs(index - center) / center;
  
  // Use continuous keyframe animation for speaking to keep bars alive
  // even when amplitude values don't change frequently
  const isConnecting = status === 'connecting';
  const isSpeaking = status === 'speaking';
  const isThinking = status === 'thinking';
  const isListening = status === 'listening';
  
  if (isMuted) {
    return (
      <motion.div
        className="rounded-full"
        style={{ width: 3, background: 'hsl(var(--primary))' }}
        animate={{ height: minHeight, opacity: 0.3 }}
        transition={{ type: "spring", stiffness: 200, damping: 25 }}
      />
    );
  }
  
  if (isConnecting) {
    return (
      <motion.div
        className="rounded-full"
        style={{ width: 3, background: 'hsl(var(--primary))' }}
        animate={{
          height: [minHeight, 32, minHeight],
          opacity: [0.3, 1, 0.3],
        }}
        transition={{
          duration: 1.2,
          repeat: Infinity,
          delay: (index / total) * 1.2,
          ease: "easeInOut",
        }}
      />
    );
  }
  
  if (isThinking) {
    return (
      <motion.div
        className="rounded-full"
        style={{ width: 3, background: 'hsl(var(--primary))' }}
        animate={{
          height: [minHeight + 6, minHeight + 16, minHeight + 6],
          opacity: [0.4, 0.8, 0.4],
        }}
        transition={{
          duration: 1.8,
          repeat: Infinity,
          delay: (index / total) * 0.5,
          ease: "easeInOut",
        }}
      />
    );
  }
  
  if (isSpeaking) {
    // Decouple from real-time amplitude: use a high floor so bars never collapse
    // between audio chunks. Amplitude adds extra intensity on top.
    const baseEnergy = 0.35;
    const amp = Math.max(amplitude, baseEnergy);
    const variance = Math.sin(index * 1.8) * 0.4 + 0.6;
    const peakHeight = Math.min(minHeight + amp * 70 * variance + (1 - distFromCenter) * 20, maxHeight);
    const midHeight = Math.min(minHeight + amp * 30 * variance + (1 - distFromCenter) * 10, maxHeight * 0.6);
    
    return (
      <motion.div
        className="rounded-full"
        style={{
          width: 3,
          background: 'hsl(var(--primary))',
          boxShadow: amp > 0.1 ? '0 0 8px hsl(var(--primary) / 0.5)' : 'none',
        }}
        animate={{
          height: [midHeight, peakHeight, midHeight * 0.7, peakHeight * 0.8, midHeight],
          opacity: [0.6, 1, 0.7, 0.9, 0.6],
        }}
        transition={{
          duration: 0.4 + (index % 5) * 0.08,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
    );
  }
  
  // Listening state
  const wave = Math.sin((index / total) * Math.PI * 2) * 0.5 + 0.5;
  const barHeight = Math.min(minHeight + (amplitude * 60 * wave) + (1 - distFromCenter) * 10, maxHeight);
  
  return (
    <motion.div
      className="rounded-full"
      style={{
        width: 3,
        background: 'hsl(var(--primary))',
        boxShadow: amplitude > 0.15 ? '0 0 6px hsl(var(--primary) / 0.4)' : 'none',
      }}
      animate={{
        height: barHeight,
        opacity: 0.4 + amplitude * 0.6,
      }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 18,
        mass: 0.3,
      }}
    />
  );
}

export function VoiceModeOverlay() {
  const {
    isActive,
    status,
    inputAmplitude,
    outputAmplitude,
    isAudioPlaying,
    currentTranscript,
    isMuted,
    deactivateVoiceMode,
    toggleMute,
    generatedImage,
    isGeneratingImage,
    setGeneratedImage,
    isSearching,
    // Camera state
    isCameraActive,
    activateCamera,
    deactivateCamera,
    cameraFacingMode,
    // Attachment state
    attachedImage,
    attachedImagePreview,
    clearAttachment,
    setAttachedImage,
  } = useVoiceModeStore();

  // File input ref for attachments
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Track whether we started elevator music so we only stop what we started
  const startedElevatorMusicRef = useRef(false);
  const previousTrackRef = useRef<string | null>(null);
  const wasPlayingRef = useRef(false);

  // Auto-play elevator music during search and image generation
  useEffect(() => {
    const isTasking = isSearching || isGeneratingImage;
    
    if (isTasking && !startedElevatorMusicRef.current) {
      // Save current music state before switching
      const { currentTrack, isPlaying, handleTrackChange, setIsPlaying, audioRef } = useMusicStore.getState();
      previousTrackRef.current = currentTrack;
      wasPlayingRef.current = isPlaying;
      startedElevatorMusicRef.current = true;
      
      // Switch to elevator track and play
      handleTrackChange('elevator');
      // Start playing after track change settles
      setTimeout(() => {
        const { audioRef: audio } = useMusicStore.getState();
        if (audio) {
          audio.volume = 0.3; // Lower volume during tasks
          audio.play().then(() => {
            useMusicStore.getState().setIsPlaying(true);
          }).catch(() => {});
        }
      }, 150);
    } else if (!isTasking && startedElevatorMusicRef.current) {
      // Stop elevator music and restore previous state
      startedElevatorMusicRef.current = false;
      const { audioRef, handleTrackChange, setIsPlaying, volume } = useMusicStore.getState();
      
      if (audioRef) {
        audioRef.pause();
        audioRef.volume = volume; // Restore original volume
      }
      setIsPlaying(false);
      
      // Restore previous track
      if (previousTrackRef.current) {
        handleTrackChange(previousTrackRef.current);
        // If music was playing before, resume it
        if (wasPlayingRef.current) {
          setTimeout(() => {
            const { audioRef: audio } = useMusicStore.getState();
            if (audio) {
              audio.play().then(() => {
                useMusicStore.getState().setIsPlaying(true);
              }).catch(() => {});
            }
          }, 150);
        }
      }
      previousTrackRef.current = null;
      wasPlayingRef.current = false;
    }
  }, [isSearching, isGeneratingImage]);

  // Handle interrupt button press
  const handleInterrupt = useCallback(() => {
    if (globalInterruptHandler) {
      console.log('Interrupt button pressed');
      // Trigger haptic feedback on supported devices
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
      globalInterruptHandler();
    }
  }, []);

  // Handle mute toggle with handoff logic
  const handleMuteToggle = useCallback(() => {
    const wasUnmuted = !isMuted;
    
    // Toggle the mute state
    toggleMute();
    
    // If user was unmuted (just muted now), check for pending speech handoff
    if (wasUnmuted && globalMuteHandoffHandler) {
      // Small delay to ensure mute state is updated
      setTimeout(() => {
        const didHandoff = globalMuteHandoffHandler?.();
        if (didHandoff) {
          console.log('Mute triggered handoff to AI');
          // Trigger haptic feedback to confirm handoff
          if (navigator.vibrate) {
            navigator.vibrate([30, 50, 30]);
          }
        }
      }, 50);
    }
  }, [isMuted, toggleMute]);

  // Handle camera toggle
  const handleCameraToggle = useCallback(() => {
    if (isCameraActive) {
      deactivateCamera();
    } else {
      activateCamera();
    }
    // Haptic feedback
    if (navigator.vibrate) {
      navigator.vibrate(30);
    }
  }, [isCameraActive, activateCamera, deactivateCamera]);

  // Handle camera switch (front/back)
  const handleCameraSwitch = useCallback(() => {
    if (globalSwitchCameraHandler) {
      globalSwitchCameraHandler();
      if (navigator.vibrate) {
        navigator.vibrate(30);
      }
    }
  }, []);

  // Handle attachment button click
  const handleAttachClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Handle file selection
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      console.error('Invalid file type:', file.type);
      return;
    }

    // Create preview URL
    const previewUrl = URL.createObjectURL(file);

    // Convert to base64
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      setAttachedImage(base64, previewUrl);
      console.log('Image attached:', file.name);
    };
    reader.readAsDataURL(file);

    // Reset input
    e.target.value = '';
  }, [setAttachedImage]);

  if (!isActive) return null;

  // Determine amplitude based on status
  const amplitude = status === 'speaking' ? outputAmplitude : (isMuted ? 0 : inputAmplitude);

  // Check if interrupt button should be visible
  const showInterruptButton = status === 'speaking' || isAudioPlaying;

  const getStatusIcon = () => {
    if (isMuted) {
      return <MicOff className="w-4 h-4 text-destructive" />;
    }
    if (status === 'speaking') {
      return <Volume2 className="w-4 h-4" />;
    }
    return <Mic className="w-4 h-4" />;
  };

  const getStatusText = () => {
    if (isSearching) return 'Searching the web...';
    if (isGeneratingImage) return 'Generating image...';
    if (isMuted) return 'Muted';
    switch (status) {
      case 'connecting': return 'Connecting...';
      case 'listening': return 'Listening...';
      case 'thinking': return 'Thinking...';
      case 'speaking': return 'Speaking...';
      default: return 'Tap to speak';
    }
  };
  
  // Check if any loading operation is in progress
  const isLoading = isGeneratingImage || isSearching;

  return (
    <AnimatePresence>
      {isActive && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-xl"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                deactivateVoiceMode();
              }
            }}
          >
            {/* Close button */}
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ delay: 0.1 }}
              onClick={deactivateVoiceMode}
              className="absolute top-6 right-6 z-10 p-3 rounded-full glass-shimmer hover:bg-muted/50 transition-colors"
              aria-label="Close voice mode"
            >
              <X className="w-6 h-6 text-foreground" />
            </motion.button>

            {/* Top-right action buttons: Camera, Attachment */}
            <div className="absolute top-6 right-20 z-10 flex items-center gap-2">
              {/* Attachment button */}
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ delay: 0.12 }}
                onClick={handleAttachClick}
                disabled={!!attachedImage}
                className={`p-3 rounded-full glass-shimmer transition-colors ${
                  attachedImage
                    ? 'bg-primary/20 border border-primary/40'
                    : 'hover:bg-muted/50'
                }`}
                aria-label="Attach image"
              >
                <Paperclip className={`w-5 h-5 ${attachedImage ? 'text-primary' : 'text-foreground'}`} />
              </motion.button>

              {/* Camera button */}
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ delay: 0.14 }}
                onClick={handleCameraToggle}
                className={`p-3 rounded-full glass-shimmer transition-colors ${
                  isCameraActive 
                    ? 'bg-primary/20 border border-primary/40' 
                    : 'hover:bg-muted/50'
                }`}
                aria-label={isCameraActive ? "Turn off camera" : "Turn on camera"}
              >
                {isCameraActive ? (
                  <CameraOff className="w-5 h-5 text-primary" />
                ) : (
                  <Camera className="w-5 h-5 text-foreground" />
                )}
              </motion.button>
            </div>

            {/* Hidden file input for attachments */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />

            {/* Mute button - also triggers handoff when muting after speaking */}
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ delay: 0.15 }}
              onClick={handleMuteToggle}
              className={`absolute top-6 left-6 z-10 p-3 rounded-full glass-shimmer transition-colors ${
                isMuted 
                  ? 'bg-destructive/20 hover:bg-destructive/30' 
                  : 'hover:bg-muted/50'
              }`}
              aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
            >
              {isMuted ? (
                <MicOff className="w-6 h-6 text-destructive" />
              ) : (
                <Mic className="w-6 h-6 text-foreground" />
              )}
            </motion.button>

            <div className="absolute inset-0 flex flex-col items-center justify-center px-4">
              {/* Camera Preview */}
              <AnimatePresence>
                {isCameraActive && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    className="mb-6 flex justify-center w-full"
                  >
                    <div className="relative w-full max-w-[200px]">
                      <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-muted/30 border-2 border-primary/40 shadow-lg">
                        {/* Video element for camera feed - populated by VoiceModeController */}
                        <video
                          ref={(el) => {
                            if (globalVideoRef && el) {
                              // @ts-ignore - we need to set the ref
                              globalVideoRef.current = el;
                            }
                          }}
                          autoPlay
                          playsInline
                          muted
                          className="w-full h-full object-cover"
                          style={{ transform: cameraFacingMode === 'user' ? 'scaleX(-1)' : 'none' }}
                        />
                        {/* Camera indicator */}
                        <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-full bg-background/80 backdrop-blur-sm">
                          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                          <span className="text-xs font-medium">LIVE</span>
                        </div>
                        {/* Switch camera button */}
                        <motion.button
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          onClick={handleCameraSwitch}
                          className="absolute bottom-2 right-2 p-2 rounded-full bg-background/80 backdrop-blur-sm hover:bg-background transition-colors"
                          aria-label="Switch camera"
                        >
                          <SwitchCamera className="w-4 h-4" />
                        </motion.button>
                      </div>
                      <p className="text-center text-xs text-muted-foreground mt-2">
                        Arc can see what you see
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Attached Image Preview */}
              <AnimatePresence>
                {attachedImagePreview && !isCameraActive && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    className="mb-6 flex justify-center w-full"
                  >
                    <div className="relative w-full max-w-[200px]">
                      <motion.img
                        src={attachedImagePreview}
                        alt="Attached"
                        className="w-full max-h-[200px] rounded-2xl shadow-lg border-2 border-primary/40 object-contain bg-background/50"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                      />
                      {/* Dismiss button */}
                      <motion.button
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        onClick={clearAttachment}
                        className="absolute -top-2 -right-2 p-1.5 rounded-full bg-background/90 border border-border shadow-lg hover:bg-muted transition-colors"
                        aria-label="Remove attachment"
                      >
                        <X className="w-4 h-4" />
                      </motion.button>
                      <p className="text-center text-xs text-muted-foreground mt-2">
                        Ask Arc about this image
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Search Loading Indicator */}
              <AnimatePresence>
                {isSearching && !generatedImage && !isGeneratingImage && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    className="mb-8 flex justify-center w-full"
                  >
                    <div className="flex flex-col items-center w-full max-w-[200px]">
                      <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-muted/30 border border-primary/20">
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="flex flex-col items-center gap-3">
                            <motion.div
                              animate={{ scale: [1, 1.2, 1] }}
                              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                            >
                              <Search className="w-8 h-8 text-primary/50" />
                            </motion.div>
                            <Loader2 className="w-5 h-5 text-primary animate-spin" />
                          </div>
                        </div>
                        {/* Shimmer effect */}
                        <motion.div
                          className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/10 to-transparent"
                          animate={{ x: ['-100%', '100%'] }}
                          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                        />
                      </div>
                      <p className="text-sm text-muted-foreground mt-3">Searching the web...</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Generated Image Display */}
              <AnimatePresence>
                {(generatedImage || isGeneratingImage) && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    className="mb-8 flex justify-center w-full"
                  >
                    {isGeneratingImage ? (
                      // Loading skeleton
                      <div className="flex flex-col items-center w-full max-w-[200px]">
                        <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-muted/30 border border-primary/20">
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="flex flex-col items-center gap-3">
                              <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                              >
                                <ImageIcon className="w-8 h-8 text-primary/50" />
                              </motion.div>
                              <Loader2 className="w-5 h-5 text-primary animate-spin" />
                            </div>
                          </div>
                          {/* Shimmer effect */}
                          <motion.div
                            className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/10 to-transparent"
                            animate={{ x: ['-100%', '100%'] }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                          />
                        </div>
                        <p className="text-sm text-muted-foreground mt-3">Creating your image...</p>
                      </div>
                    ) : generatedImage ? (
                      // Generated image
                      <div className="relative w-full max-w-[260px]">
                        <motion.img
                          src={generatedImage}
                          alt="Generated"
                          className="w-full max-h-[260px] rounded-2xl shadow-2xl border border-primary/20 object-contain bg-background/50"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.1 }}
                        />
                        <motion.button
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.2 }}
                          onClick={() => setGeneratedImage(null)}
                          className="absolute -top-2 -right-2 p-1.5 rounded-full bg-background/90 border border-border shadow-lg hover:bg-muted transition-colors"
                          aria-label="Close image"
                        >
                          <X className="w-4 h-4" />
                        </motion.button>
                        <motion.p
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.3 }}
                          className="text-center text-xs text-muted-foreground mt-2"
                        >
                          Say "close image" or tap × to dismiss
                        </motion.p>
                      </div>
                    ) : null}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Horizontal Audio Waveform Visualizer */}
              <motion.div
                className="relative"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 200, damping: 20 }}
              >
                <div className="flex items-center justify-center gap-[3px] px-8 py-6 rounded-2xl bg-muted/10 backdrop-blur-sm">
                  {Array.from({ length: 24 }).map((_, i) => (
                    <WaveformBar
                      key={i}
                      index={i}
                      total={24}
                      amplitude={amplitude}
                      status={status}
                      isMuted={isMuted}
                    />
                  ))}
                </div>
              </motion.div>

              {/* Ear icon when listening */}
              <AnimatePresence>
                {status === 'listening' && !isMuted && !isGeneratingImage && !isSearching && !showInterruptButton && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                    className="mt-4"
                  >
                    <Ear className="w-6 h-6 text-muted-foreground/60" />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Status text - only show when generating image or searching */}
              <AnimatePresence>
                {(isGeneratingImage || isSearching) && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ delay: 0.2 }}
                    className="mt-6 flex items-center gap-2 text-muted-foreground"
                  >
                    {isGeneratingImage ? (
                      <ImageIcon className="w-4 h-4" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                    <span className="text-sm font-medium">{getStatusText()}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Interrupt Button - compact, bottom-positioned */}
              <AnimatePresence>
                {showInterruptButton && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.8, y: 10 }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    onClick={handleInterrupt}
                    className="mt-4 px-4 py-2.5 rounded-full glass-shimmer border border-primary/40
                               flex items-center gap-2 hover:bg-primary/10 active:scale-95 transition-all"
                    aria-label="Interrupt"
                  >
                    <Hand className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium text-primary">Interrupt</span>
                  </motion.button>
                )}
              </AnimatePresence>

            </div>
          </motion.div>

          {/* VoiceModeController is mounted in MobileChatApp.tsx to prevent duplicate instances */}
        </>
      )}
    </AnimatePresence>
  );
}
