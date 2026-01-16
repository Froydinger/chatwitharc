import { useEffect, useRef } from 'react';
import { useVoiceModeStore } from '@/store/useVoiceModeStore';
import { useOpenAIRealtime } from '@/hooks/useOpenAIRealtime';
import { useAudioCapture } from '@/hooks/useAudioCapture';
import { useAudioPlayback } from '@/hooks/useAudioPlayback';
import { useArcStore } from '@/store/useArcStore';
import { useToast } from '@/hooks/use-toast';

export function VoiceModeController() {
  const { toast } = useToast();
  const { addMessage } = useArcStore();
  const {
    isActive,
    status,
    selectedVoice,
    conversationTurns,
    deactivateVoiceMode,
  } = useVoiceModeStore();

  const hasConnectedRef = useRef(false);
  const previousVoiceRef = useRef(selectedVoice);

  // Audio playback for AI responses
  const { queueAudio, stopPlayback } = useAudioPlayback();

  // OpenAI Realtime connection
  const { isConnected, connect, disconnect, sendAudio, updateVoice } = useOpenAIRealtime({
    onAudioData: (audioData) => {
      queueAudio(audioData);
    },
    onError: (error) => {
      console.error('Voice mode error:', error);
      toast({
        title: 'Voice Error',
        description: error,
        variant: 'destructive',
      });
      deactivateVoiceMode();
    },
  });

  // Audio capture from microphone
  const { startCapture, stopCapture } = useAudioCapture({
    onAudioData: (audioData) => {
      sendAudio(audioData);
    },
  });

  // Connect when voice mode activates
  useEffect(() => {
    if (isActive && !hasConnectedRef.current) {
      hasConnectedRef.current = true;
      
      const initVoiceMode = async () => {
        try {
          await connect();
          await startCapture();
        } catch (error) {
          console.error('Failed to initialize voice mode:', error);
          toast({
            title: 'Microphone Error',
            description: 'Could not access microphone. Please grant permission.',
            variant: 'destructive',
          });
          deactivateVoiceMode();
        }
      };

      initVoiceMode();
    }

    return () => {
      if (!isActive && hasConnectedRef.current) {
        hasConnectedRef.current = false;
      }
    };
  }, [isActive, connect, startCapture, toast, deactivateVoiceMode]);

  // Disconnect when voice mode deactivates
  useEffect(() => {
    if (!isActive && hasConnectedRef.current) {
      stopCapture();
      stopPlayback();
      disconnect();
      hasConnectedRef.current = false;

      // Save conversation to chat history
      if (conversationTurns.length > 0) {
        conversationTurns.forEach((turn) => {
          addMessage({
            content: turn.transcript,
            role: turn.role,
            type: 'text',
            // Mark as voice-sourced (could add a 'source' field if needed)
          });
        });

        toast({
          title: 'Conversation saved',
          description: `${conversationTurns.length} messages added to chat`,
        });
      }
    }
  }, [isActive, conversationTurns, stopCapture, stopPlayback, disconnect, addMessage, toast]);

  // Update voice when selection changes
  useEffect(() => {
    if (isConnected && selectedVoice !== previousVoiceRef.current) {
      previousVoiceRef.current = selectedVoice;
      updateVoice(selectedVoice);
    }
  }, [selectedVoice, isConnected, updateVoice]);

  // This component doesn't render anything visible - it just manages the connection
  return null;
}
