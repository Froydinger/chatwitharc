import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { useArcStore } from "@/store/useArcStore";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";

export function VoiceInterface() {
  const { selectedVoice, isLoading, addMessage } = useArcStore();
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  // Simulate audio level for visual feedback
  useEffect(() => {
    if (!isRecording) return;
    
    const interval = setInterval(() => {
      setAudioLevel(Math.random() * 100);
    }, 100);
    
    return () => clearInterval(interval);
  }, [isRecording]);

  const toggleRecording = async () => {
    if (isRecording) {
      setIsRecording(false);
      setAudioLevel(0);
      
      // Simulate processing voice input
      await addMessage({
        content: "Voice message recorded (demo)",
        role: 'user',
        type: 'voice'
      });
      
      // Simulate AI voice response
      setTimeout(async () => {
        setIsSpeaking(true);
        await addMessage({
          content: "This is a demo voice response from ArcAI. The OpenAI Realtime API will enable seamless voice conversations with Cedar and Marin voices.",
          role: 'assistant',
          type: 'voice'
        });
        
        setTimeout(() => {
          setIsSpeaking(false);
        }, 3000);
      }, 1500);
    } else {
      setIsRecording(true);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full max-h-[70vh] w-full max-w-2xl mx-auto space-y-8">
      {/* Voice Visualizer */}
      <GlassCard variant="bubble" glow float className="p-8">
        <div className="text-center space-y-6">
          <motion.div
            animate={isRecording ? { scale: [1, 1.1, 1] } : {}}
            transition={{ duration: 1, repeat: Infinity }}
            className="relative mx-auto w-32 h-32"
          >
            {/* Outer Ring - Recording Indicator */}
            <motion.div
              animate={isRecording ? {
                scale: [1, 1.2, 1],
                opacity: [0.3, 0.6, 0.3]
              } : {}}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute inset-0 rounded-full border-4 border-primary-glow"
            />
            
            {/* Inner Circle - Audio Level */}
            <motion.div
              animate={{
                scale: isRecording ? 1 + (audioLevel / 100) * 0.3 : 1
              }}
              className="absolute inset-4 rounded-full glass-strong flex items-center justify-center"
            >
              {isRecording ? (
                <Mic className="h-12 w-12 text-primary-glow" />
              ) : isSpeaking ? (
                <Volume2 className="h-12 w-12 text-success" />
              ) : (
                <MicOff className="h-12 w-12 text-muted-foreground" />
              )}
            </motion.div>

            {/* Audio Bars */}
            {isRecording && (
              <div className="absolute -inset-8 flex items-center justify-center">
                {[...Array(8)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="w-1 bg-primary-glow rounded-full mx-1"
                    animate={{
                      height: [8, 16 + (audioLevel / 100) * 24, 8],
                    }}
                    transition={{
                      duration: 0.5,
                      repeat: Infinity,
                      delay: i * 0.1,
                    }}
                  />
                ))}
              </div>
            )}
          </motion.div>

          <div className="space-y-2">
            <h3 className="text-xl font-semibold text-foreground">
              {isRecording ? "Listening..." : 
               isSpeaking ? "Speaking..." : 
               "Voice Mode"}
            </h3>
            <p className="text-muted-foreground">
              {isRecording ? "Say something to ArcAI" : 
               isSpeaking ? "Playing response" :
               "Tap to start voice conversation"}
            </p>
          </div>
        </div>
      </GlassCard>

      {/* Voice Controls */}
      <div className="flex items-center gap-4">
        <GlassButton
          variant={isRecording ? "glow" : "bubble"}
          size="bubble"
          onClick={toggleRecording}
          disabled={isLoading || isSpeaking}
          className={`relative ${isRecording ? "animate-glow-pulse" : ""}`}
        >
          {isRecording ? (
            <MicOff className="h-6 w-6" />
          ) : (
            <Mic className="h-6 w-6" />
          )}
        </GlassButton>

        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            Voice: {selectedVoice === 'cedar' ? 'Cedar' : 'Marin'}
          </p>
          <p className="text-xs text-muted-foreground">
            Realtime API Ready
          </p>
        </div>
      </div>

      {/* Status Messages */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-center space-y-2"
      >
        <div className="glass rounded-lg px-4 py-2 inline-block">
          <p className="text-sm text-muted-foreground">
            🎙️ OpenAI Realtime API integration ready
          </p>
        </div>
        <div className="glass rounded-lg px-4 py-2 inline-block">
          <p className="text-sm text-muted-foreground">
            🔊 Cedar & Marin voices supported
          </p>
        </div>
      </motion.div>
    </div>
  );
}