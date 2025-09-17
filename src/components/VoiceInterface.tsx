import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Mic, MicOff, Volume2, VolumeX, Wifi, WifiOff } from "lucide-react";
import { useArcStore } from "@/store/useArcStore";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { RealtimeVoiceChat } from "@/utils/RealtimeAudio";
import { useToast } from "@/components/ui/use-toast";

export function VoiceInterface() {
  const { selectedVoice, isLoading, addMessage } = useArcStore();
  const { toast } = useToast();
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const voiceChatRef = useRef<RealtimeVoiceChat | null>(null);

  // Handle voice messages and events
  const handleVoiceMessage = (event: any) => {
    console.log('Voice event:', event);
    
    switch (event.type) {
      case 'connection.opened':
        setIsConnected(true);
        setConnectionStatus('connected');
        break;
        
      case 'connection.error':
        setIsConnected(false);
        setConnectionStatus('disconnected');
        toast({
          title: "Connection Error",
          description: "Failed to connect to voice service",
          variant: "destructive",
        });
        break;
        
      case 'connection.closed':
        setIsConnected(false);
        setConnectionStatus('disconnected');
        setIsRecording(false);
        setIsSpeaking(false);
        break;
        
      case 'session.created':
      case 'session.updated':
        console.log('Session ready');
        break;
        
      case 'input_audio_buffer.speech_started':
        console.log('Speech started');
        break;
        
      case 'input_audio_buffer.speech_stopped':
        console.log('Speech stopped');
        setIsRecording(false);
        break;
        
      case 'response.audio.delta':
        setIsSpeaking(true);
        break;
        
      case 'response.audio.done':
        setIsSpeaking(false);
        break;
        
      case 'response.audio_transcript.delta':
        // Handle AI response transcript
        if (event.delta) {
          // Add or update AI message
          addMessage({
            content: event.delta,
            role: 'assistant',
            type: 'voice'
          });
        }
        break;
        
      case 'conversation.item.input_audio_transcription.completed':
        // Handle user speech transcription
        if (event.transcript) {
          addMessage({
            content: event.transcript,
            role: 'user',
            type: 'voice'
          });
        }
        break;
    }
  };

  // Audio level simulation for visual feedback when recording
  useEffect(() => {
    if (!isRecording) return;
    
    const interval = setInterval(() => {
      setAudioLevel(Math.random() * 100);
    }, 100);
    
    return () => clearInterval(interval);
  }, [isRecording]);

  // Initialize voice chat
  const connectToVoice = async () => {
    if (connectionStatus === 'connecting') return;
    
    try {
      setConnectionStatus('connecting');
      
      voiceChatRef.current = new RealtimeVoiceChat(handleVoiceMessage);
      await voiceChatRef.current.connect();
      
      // Update voice preference
      if (voiceChatRef.current && selectedVoice) {
        voiceChatRef.current.updateVoice(selectedVoice === 'cedar' ? 'cedar' : 'marin');
      }
      
      toast({
        title: "Voice Mode Ready",
        description: "Hold the microphone button to speak",
      });
      
    } catch (error) {
      console.error('Failed to connect:', error);
      setConnectionStatus('disconnected');
      toast({
        title: "Connection Failed",
        description: "Could not connect to voice service",
        variant: "destructive",
      });
    }
  };

  // Disconnect voice chat
  const disconnectVoice = () => {
    voiceChatRef.current?.disconnect();
    voiceChatRef.current = null;
    setIsConnected(false);
    setConnectionStatus('disconnected');
    setIsRecording(false);
    setIsSpeaking(false);
  };

  // Handle mouse/touch events for push-to-talk
  const handleRecordStart = async () => {
    if (!isConnected || isLoading || isSpeaking) return;
    
    try {
      await voiceChatRef.current?.startRecording();
      setIsRecording(true);
      setAudioLevel(0);
    } catch (error) {
      console.error('Failed to start recording:', error);
      toast({
        title: "Recording Failed",
        description: "Could not access microphone",
        variant: "destructive",
      });
    }
  };

  const handleRecordStop = () => {
    if (!isRecording) return;
    
    voiceChatRef.current?.stopRecording();
    setIsRecording(false);
    setAudioLevel(0);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      voiceChatRef.current?.disconnect();
    };
  }, []);

  // Update voice when selectedVoice changes
  useEffect(() => {
    if (voiceChatRef.current && isConnected) {
      voiceChatRef.current.updateVoice(selectedVoice === 'cedar' ? 'cedar' : 'marin');
    }
  }, [selectedVoice, isConnected]);

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

      {/* Connection Controls */}
      {!isConnected ? (
        <div className="flex flex-col items-center gap-4">
          <GlassButton
            variant="glow"
            size="lg"
            onClick={connectToVoice}
            disabled={connectionStatus === 'connecting'}
            className="px-8"
          >
            <Wifi className="h-5 w-5 mr-2" />
            {connectionStatus === 'connecting' ? 'Connecting...' : 'Connect Voice'}
          </GlassButton>
        </div>
      ) : (
        <>
          {/* Voice Controls */}
          <div className="flex items-center gap-6">
            <GlassButton
              variant={isRecording ? "glow" : "bubble"}
              size="bubble"
              onMouseDown={handleRecordStart}
              onMouseUp={handleRecordStop}
              onTouchStart={handleRecordStart}
              onTouchEnd={handleRecordStop}
              disabled={isLoading || isSpeaking || !isConnected}
              className={`relative select-none ${isRecording ? "animate-glow-pulse scale-110" : ""} transition-transform duration-200`}
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
                {isRecording ? 'Release to send' : 'Hold to talk'}
              </p>
            </div>

            <GlassButton
              variant="ghost"
              size="sm"
              onClick={disconnectVoice}
              className="text-muted-foreground hover:text-foreground"
            >
              <WifiOff className="h-4 w-4" />
            </GlassButton>
          </div>
        </>
      )}

      {/* Status Messages */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-center space-y-2"
      >
        {isConnected ? (
          <div className="glass rounded-lg px-4 py-2 inline-block">
            <p className="text-sm text-success flex items-center justify-center gap-2">
              <Wifi className="h-4 w-4" />
              Connected to OpenAI Realtime API
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="glass rounded-lg px-4 py-2 inline-block">
              <p className="text-sm text-muted-foreground">
                🎙️ OpenAI gpt-realtime model
              </p>
            </div>
            <div className="glass rounded-lg px-4 py-2 inline-block">
              <p className="text-sm text-muted-foreground">
                🔊 Cedar & Marin voices supported
              </p>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}