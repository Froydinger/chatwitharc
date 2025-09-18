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
        const errorMsg = typeof event.error === 'string' ? event.error : 'Failed to connect to voice service';
        toast({
          title: "Connection Error",
          description: errorMsg,
          variant: "destructive",
        });
        console.error("Voice connection error:", event.error);
        break;
        
      case 'connection.closed':
        setIsConnected(false);
        setConnectionStatus('disconnected');
        setIsRecording(false);
        setIsSpeaking(false);
        if (event.reason) {
          console.log("Connection closed with reason:", event.reason);
          toast({
            title: "Connection Closed",
            description: event.reason,
            variant: "destructive",
          });
        }
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
    <div className="flex flex-col items-center justify-center h-full p-8">
      {/* Voice Orb Container */}
      <div className="relative flex flex-col items-center justify-center">
        
        {/* Main Orb */}
        <div className="relative w-48 h-48 mb-8">
          {/* Glow Effect */}
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{
              background: (isConnected || isSpeaking) 
                ? `radial-gradient(circle, 
                    hsl(var(--primary) / 0.4) 0%, 
                    hsl(var(--primary) / 0.2) 40%, 
                    transparent 70%)`
                : 'transparent'
            }}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ 
              scale: (isConnected || isSpeaking) 
                ? (isSpeaking ? [1, 1.4, 1] : [1, 1.2, 1])
                : 0.8,
              opacity: (isConnected || isSpeaking) ? 1 : 0
            }}
            transition={{ 
              duration: isSpeaking ? 1.5 : 3,
              repeat: (isConnected || isSpeaking) ? Infinity : 0,
              ease: "easeInOut"
            }}
          />

          {/* Outer Ring */}
          <motion.div 
            className="absolute inset-4 rounded-full border-2"
            style={{
              borderColor: isConnected 
                ? 'hsl(var(--primary) / 0.4)' 
                : 'hsl(var(--muted-foreground) / 0.2)'
            }}
            animate={{
              rotate: isConnected ? 360 : 0,
              scale: isRecording ? [1, 1.1, 1] : 1
            }}
            transition={{
              rotate: { duration: 8, repeat: Infinity, ease: "linear" },
              scale: { duration: 1, repeat: Infinity, ease: "easeInOut" }
            }}
          />

          {/* Inner Ring */}
          <motion.div 
            className="absolute inset-8 rounded-full border-2"
            style={{
              borderColor: isRecording 
                ? 'hsl(var(--destructive) / 0.6)' 
                : 'hsl(var(--muted-foreground) / 0.3)'
            }}
            animate={{
              rotate: isConnected ? -360 : 0,
              opacity: isRecording ? [0.3, 1, 0.3] : 0.6
            }}
            transition={{
              rotate: { duration: 6, repeat: Infinity, ease: "linear" },
              opacity: { duration: 0.8, repeat: Infinity, ease: "easeInOut" }
            }}
          />

          {/* Core Orb */}
          <motion.div 
            className="absolute inset-12 rounded-full flex items-center justify-center"
            style={{
              background: isConnected 
                ? `radial-gradient(circle at 30% 30%, 
                    hsl(var(--primary) / 0.9), 
                    hsl(var(--primary) / 0.7), 
                    hsl(var(--primary) / 0.5))`
                : 'hsl(var(--muted-foreground) / 0.3)'
            }}
            animate={{
              scale: isSpeaking 
                ? [1, 1.3, 1] 
                : isRecording 
                  ? [1, 1.1, 1] 
                  : [1, 1.05, 1]
            }}
            transition={{
              duration: isSpeaking ? 0.6 : isRecording ? 0.4 : 2,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          >
            {/* Audio Level Indicator */}
            <motion.div 
              className="w-8 h-8 rounded-full"
              style={{
                background: isConnected 
                  ? 'radial-gradient(circle, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.4) 100%)'
                  : 'rgba(255,255,255,0.2)'
              }}
              animate={{
                scale: 1 + (audioLevel / 100) * 1.5
              }}
              transition={{ duration: 0.1 }}
            />
          </motion.div>

          {/* Voice Icon */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <motion.div
              animate={{
                opacity: isSpeaking ? [0.5, 1, 0.5] : 1
              }}
              transition={{ duration: 0.8, repeat: Infinity }}
            >
              {isRecording ? (
                <Mic className="w-6 h-6 text-white" />
              ) : isSpeaking ? (
                <Volume2 className="w-6 h-6 text-white" />
              ) : isConnected ? (
                <div className="w-2 h-2 rounded-full bg-white" />
              ) : (
                <VolumeX className="w-6 h-6 text-muted-foreground" />
              )}
            </motion.div>
          </div>
        </div>

        {/* Status Text */}
        <motion.div 
          className="text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <h2 className="text-2xl font-semibold mb-2 text-foreground">
            ArcAI Voice
          </h2>
          <p className={`text-base mb-4 ${
            isConnected ? 'text-primary' : 'text-muted-foreground'
          }`}>
            {isConnected 
              ? (isRecording ? 'Listening...' : isSpeaking ? 'Speaking...' : 'Ready to chat') 
              : connectionStatus === 'connecting' ? 'Connecting...' : 'Tap to connect'
            }
          </p>
        </motion.div>

        {/* Main Action Button */}
        <motion.button
          onClick={!isConnected ? connectToVoice : undefined}
          onMouseDown={isConnected ? handleRecordStart : undefined}
          onMouseUp={isConnected ? handleRecordStop : undefined}
          onTouchStart={isConnected ? handleRecordStart : undefined}
          onTouchEnd={isConnected ? handleRecordStop : undefined}
          disabled={connectionStatus === 'connecting' || (isConnected && (isLoading || isSpeaking))}
          className={`
            px-8 py-3 rounded-full font-medium transition-all duration-300 select-none
            ${!isConnected 
              ? 'glass hover:glass-glow text-foreground' 
              : isRecording
                ? 'bg-destructive/80 hover:bg-destructive text-destructive-foreground'
                : 'glass-strong hover:glass-glow text-foreground'
            }
            ${(connectionStatus === 'connecting' || (isConnected && (isLoading || isSpeaking))) 
              ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          {!isConnected 
            ? (connectionStatus === 'connecting' ? 'Connecting...' : 'Connect Voice')
            : isRecording 
              ? 'Release to Stop'
              : 'Hold to Talk'
          }
        </motion.button>

        {/* Disconnect Button */}
        {isConnected && (
          <motion.button
            onClick={disconnectVoice}
            className="mt-4 px-4 py-2 text-sm glass hover:glass-glow text-muted-foreground hover:text-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            whileHover={{ scale: 1.02 }}
          >
            Disconnect
          </motion.button>
        )}

        {/* Voice Info */}
        {isConnected && (
          <motion.div 
            className="mt-4 text-sm text-muted-foreground text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
          >
            Voice: {selectedVoice === 'cedar' ? 'Cedar' : 'Marin'}
          </motion.div>
        )}
      </div>
    </div>
  );
}