import { motion, AnimatePresence } from "framer-motion";
import { X, Mic, MicOff, Volume2, Loader2, ImageIcon, Search, Square } from "lucide-react";
import { useVoiceModeStore } from "@/store/useVoiceModeStore";
import { useCallback } from "react";

// Global ref to allow interrupt from overlay - set by VoiceModeController
let globalInterruptHandler: (() => void) | null = null;

export function setGlobalInterruptHandler(handler: (() => void) | null) {
  globalInterruptHandler = handler;
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
  } = useVoiceModeStore();

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

  if (!isActive) return null;

  // Determine orb animation based on status
  const amplitude = status === 'speaking' ? outputAmplitude : (isMuted ? 0 : inputAmplitude);
  const orbScale = 1 + amplitude * 0.4;
  const glowIntensity = 40 + amplitude * 60;

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

            {/* Mute button */}
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ delay: 0.15 }}
              onClick={toggleMute}
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

            <div className="absolute inset-0 flex flex-col items-center justify-center">
              {/* Search Loading Indicator */}
              <AnimatePresence>
                {isSearching && !generatedImage && !isGeneratingImage && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    className="absolute top-20 inset-x-4 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 z-10 flex justify-center"
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
                    className="absolute top-20 inset-x-4 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 z-10 flex justify-center"
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

              {/* Animated liquid orb - NO tap interrupt, just visual */}
              <motion.div
                className="relative"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ 
                  scale: 1, 
                  opacity: 1,
                  y: (generatedImage || isGeneratingImage) ? 100 : 0 
                }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 200, damping: 20 }}
              >
                {/* Outer glow rings */}
                <motion.div
                  className="absolute inset-0 rounded-full w-[200px] h-[200px] sm:w-[280px] sm:h-[280px] -ml-[12px] -mt-[12px] sm:-ml-[15px] sm:-mt-[15px]"
                  animate={{
                    scale: [1, 1.2, 1],
                    opacity: [0.3, 0.1, 0.3],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                  style={{
                    background: `radial-gradient(circle, hsl(var(--primary) / 0.2), transparent 70%)`,
                  }}
                />

                {/* Main orb */}
                <motion.div
                  className="w-[175px] h-[175px] sm:w-[250px] sm:h-[250px] rounded-full relative overflow-hidden"
                  animate={{
                    scale: orbScale,
                    borderRadius: status === 'speaking' 
                      ? ["50%", "47%", "52%", "48%", "50%"]
                      : "50%",
                  }}
                  transition={{
                    scale: { type: "spring", stiffness: 300, damping: 20 },
                    borderRadius: { duration: 0.5, repeat: status === 'speaking' ? Infinity : 0 },
                  }}
                  style={{
                    background: `
                      radial-gradient(
                        circle at 30% 30%,
                        hsl(var(--primary) / 0.6),
                        hsl(var(--primary) / 0.3) 50%,
                        hsl(var(--primary) / 0.1) 100%
                      )
                    `,
                    backdropFilter: "blur(40px)",
                    boxShadow: `
                      0 0 ${glowIntensity}px hsl(var(--primary) / 0.4),
                      inset 0 0 60px hsl(var(--primary) / 0.1),
                      0 8px 32px rgba(0, 0, 0, 0.2)
                    `,
                    border: "1px solid hsl(var(--primary) / 0.3)",
                  }}
                >
                  {/* Inner shimmer effect */}
                  <motion.div
                    className="absolute inset-0 rounded-full"
                    animate={{
                      background: [
                        "linear-gradient(135deg, transparent 0%, hsl(var(--primary) / 0.2) 50%, transparent 100%)",
                        "linear-gradient(225deg, transparent 0%, hsl(var(--primary) / 0.2) 50%, transparent 100%)",
                        "linear-gradient(315deg, transparent 0%, hsl(var(--primary) / 0.2) 50%, transparent 100%)",
                        "linear-gradient(45deg, transparent 0%, hsl(var(--primary) / 0.2) 50%, transparent 100%)",
                        "linear-gradient(135deg, transparent 0%, hsl(var(--primary) / 0.2) 50%, transparent 100%)",
                      ],
                    }}
                    transition={{
                      duration: 4,
                      repeat: Infinity,
                      ease: "linear",
                    }}
                  />

                  {/* Connecting spinner */}
                  {status === 'connecting' && (
                    <motion.div
                      className="absolute inset-0 flex items-center justify-center"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                    >
                      <div className="w-16 h-16 border-2 border-t-transparent border-primary/50 rounded-full" />
                    </motion.div>
                  )}

                  {/* Listening pulse rings */}
                  {status === 'listening' && (
                    <>
                      <motion.div
                        className="absolute inset-0 rounded-full border-2 border-primary/30"
                        animate={{
                          scale: [1, 1.3],
                          opacity: [0.5, 0],
                        }}
                        transition={{
                          duration: 1.5,
                          repeat: Infinity,
                          ease: "easeOut",
                        }}
                      />
                      <motion.div
                        className="absolute inset-0 rounded-full border-2 border-primary/30"
                        animate={{
                          scale: [1, 1.3],
                          opacity: [0.5, 0],
                        }}
                        transition={{
                          duration: 1.5,
                          repeat: Infinity,
                          ease: "easeOut",
                          delay: 0.5,
                        }}
                      />
                    </>
                  )}

                  {/* Thinking animation */}
                  {status === 'thinking' && (
                    <motion.div
                      className="absolute inset-0 flex items-center justify-center gap-2"
                    >
                      {[0, 1, 2].map((i) => (
                        <motion.div
                          key={i}
                          className="w-3 h-3 rounded-full bg-primary/60"
                          animate={{
                            y: [-5, 5, -5],
                            opacity: [0.5, 1, 0.5],
                          }}
                          transition={{
                            duration: 0.8,
                            repeat: Infinity,
                            ease: "easeInOut",
                            delay: i * 0.15,
                          }}
                        />
                      ))}
                    </motion.div>
                  )}
                </motion.div>
              </motion.div>

              {/* Status text */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ 
                  opacity: 1, 
                  y: (generatedImage || isGeneratingImage) ? 110 : 0 
                }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ delay: 0.2 }}
                className="mt-8 flex items-center gap-2 text-muted-foreground"
              >
                {isGeneratingImage ? (
                  <ImageIcon className="w-4 h-4" />
                ) : (
                  getStatusIcon()
                )}
                <span className="text-sm font-medium">{getStatusText()}</span>
              </motion.div>

              {/* BIG CENTERED INTERRUPT BUTTON - Only shows when AI is speaking */}
              <AnimatePresence>
                {showInterruptButton && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.8, y: 20 }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    onClick={handleInterrupt}
                    className="mt-8 px-10 py-5 rounded-full bg-destructive text-destructive-foreground
                               text-lg font-semibold shadow-2xl
                               hover:bg-destructive/90 active:scale-95 transition-all
                               flex items-center gap-3"
                    aria-label="Stop AI"
                  >
                    <Square className="w-6 h-6 fill-current" />
                    <span>Stop</span>
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
