import { motion, AnimatePresence } from "framer-motion";
import { X, Mic, MicOff, Volume2 } from "lucide-react";
import { useVoiceModeStore } from "@/store/useVoiceModeStore";
import { VoiceModeController } from "./VoiceModeController";

export function VoiceModeOverlay() {
  const {
    isActive,
    status,
    inputAmplitude,
    outputAmplitude,
    currentTranscript,
    isMuted,
    deactivateVoiceMode,
    toggleMute,
  } = useVoiceModeStore();

  if (!isActive) return null;

  // Determine orb animation based on status
  const amplitude = status === 'speaking' ? outputAmplitude : (isMuted ? 0 : inputAmplitude);
  const orbScale = 1 + amplitude * 0.4;
  const glowIntensity = 40 + amplitude * 60;

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
    if (isMuted) return 'Muted';
    switch (status) {
      case 'connecting': return 'Connecting...';
      case 'listening': return 'Listening...';
      case 'thinking': return 'Thinking...';
      case 'speaking': return 'Speaking...';
      default: return 'Tap to speak';
    }
  };

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
              {/* Animated liquid orb */}
              <motion.div
                className="relative"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 200, damping: 20 }}
              >
                {/* Outer glow rings */}
                <motion.div
                  className="absolute inset-0 rounded-full"
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
                    width: 280,
                    height: 280,
                    marginLeft: -15,
                    marginTop: -15,
                    background: `radial-gradient(circle, hsl(var(--primary) / 0.2), transparent 70%)`,
                  }}
                />

                {/* Main orb */}
                <motion.div
                  className="w-[250px] h-[250px] rounded-full relative overflow-hidden"
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
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ delay: 0.2 }}
                className="mt-8 flex items-center gap-2 text-muted-foreground"
              >
                {getStatusIcon()}
                <span className="text-sm font-medium">{getStatusText()}</span>
              </motion.div>

              {/* Live transcript */}
              {currentTranscript && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-6 max-w-md px-6 text-center"
                >
                  <p className="text-lg text-foreground/80 italic">
                    "{currentTranscript}"
                  </p>
                </motion.div>
              )}
            </div>
          </motion.div>

          {/* Voice mode controller (handles actual connection logic) */}
          <VoiceModeController />
        </>
      )}
    </AnimatePresence>
  );
}
