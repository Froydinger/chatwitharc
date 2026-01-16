import { useEffect, useRef, useCallback } from 'react';
import { useVoiceModeStore } from '@/store/useVoiceModeStore';
import { useOpenAIRealtime } from '@/hooks/useOpenAIRealtime';
import { useAudioCapture } from '@/hooks/useAudioCapture';
import { useAudioPlayback } from '@/hooks/useAudioPlayback';
import { useArcStore } from '@/store/useArcStore';
import { useToast } from '@/hooks/use-toast';
import { AIService } from '@/services/ai';
import { supabase } from '@/integrations/supabase/client';

const aiService = new AIService();
const LOADING_MUSIC_VOLUME = 0.14; // 14% volume for elevator music during loading
export function VoiceModeController() {
  const { toast } = useToast();
  const { addMessage } = useArcStore();
  const {
    isActive,
    selectedVoice,
    deactivateVoiceMode,
    setGeneratedImage,
    setIsGeneratingImage,
    setLastGeneratedImageUrl,
    setIsSearching,
  } = useVoiceModeStore();

  // Track initialization to prevent duplicate setup
  const initRef = useRef(false);
  const wasActiveRef = useRef(false);
  const previousVoiceRef = useRef(selectedVoice);
  
  // Audio ref for loading music
  const loadingMusicRef = useRef<HTMLAudioElement | null>(null);

  // Audio playback for AI responses
  const { queueAudio, stopPlayback, clearQueue } = useAudioPlayback();
  
  // Start playing elevator music during loading
  const startLoadingMusic = useCallback(() => {
    if (!loadingMusicRef.current) {
      loadingMusicRef.current = new Audio('/audio/elevator-music.mp3');
      loadingMusicRef.current.loop = true;
    }
    loadingMusicRef.current.volume = LOADING_MUSIC_VOLUME;
    loadingMusicRef.current.currentTime = 0;
    loadingMusicRef.current.play().catch(console.error);
  }, []);
  
  // Stop loading music
  const stopLoadingMusic = useCallback(() => {
    if (loadingMusicRef.current) {
      loadingMusicRef.current.pause();
      loadingMusicRef.current.currentTime = 0;
    }
  }, []);

  // Image generation handler
  const handleImageGenerate = useCallback(async (prompt: string): Promise<string> => {
    console.log('VoiceModeController: Generating image with prompt:', prompt);
    setIsGeneratingImage(true);
    startLoadingMusic(); // Play elevator music while generating
    
    try {
      const imageUrl = await aiService.generateImage(prompt);
      console.log('VoiceModeController: Image generated:', imageUrl);
      setGeneratedImage(imageUrl);
      setLastGeneratedImageUrl(imageUrl); // Track for attaching to conversation
      setIsGeneratingImage(false);
      stopLoadingMusic(); // Stop music when done
      return imageUrl;
    } catch (error) {
      console.error('VoiceModeController: Image generation failed:', error);
      setIsGeneratingImage(false);
      stopLoadingMusic(); // Stop music on error too
      throw error;
    }
  }, [setGeneratedImage, setIsGeneratingImage, setLastGeneratedImageUrl, startLoadingMusic, stopLoadingMusic]);

  // Image dismiss handler
  const handleImageDismiss = useCallback(() => {
    console.log('VoiceModeController: Dismissing image');
    setGeneratedImage(null);
  }, [setGeneratedImage]);

  // Web search handler
  const handleWebSearch = useCallback(async (query: string): Promise<string> => {
    console.log('VoiceModeController: Web search for:', query);
    setIsSearching(true);
    startLoadingMusic(); // Play elevator music while searching
    
    try {
      // Call the chat function with forceWebSearch to get real-time results
      const { data, error } = await supabase.functions.invoke('chat', {
        body: {
          messages: [{ role: 'user', content: query }],
          forceWebSearch: true
        }
      });
      
      stopLoadingMusic();
      setIsSearching(false);
      
      if (error) {
        console.error('Web search error:', error);
        throw new Error(error.message);
      }
      
      // Return the AI's response which includes web search results
      const response = data?.choices?.[0]?.message?.content || 'No results found.';
      console.log('VoiceModeController: Web search complete');
      return response;
    } catch (error) {
      console.error('VoiceModeController: Web search failed:', error);
      stopLoadingMusic();
      setIsSearching(false);
      throw error;
    }
  }, [setIsSearching, startLoadingMusic, stopLoadingMusic]);

  // OpenAI Realtime connection
  const { isConnected, connect, disconnect, sendAudio, updateVoice } = useOpenAIRealtime({
    onAudioData: (audioData) => {
      queueAudio(audioData);
    },
    onInterrupt: () => {
      // User interrupted - clear any queued audio immediately
      console.log('Clearing audio queue due to interruption');
      clearQueue();
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
    onImageGenerate: handleImageGenerate,
    onImageDismiss: handleImageDismiss,
    onWebSearch: handleWebSearch,
  });

  // Audio capture from microphone
  const { startCapture, stopCapture } = useAudioCapture({
    onAudioData: (audioData) => {
      sendAudio(audioData);
    },
  });

  // Single effect to handle activation/deactivation
  useEffect(() => {
    const justActivated = isActive && !wasActiveRef.current;
    const justDeactivated = !isActive && wasActiveRef.current;
    
    wasActiveRef.current = isActive;

    if (justActivated && !initRef.current) {
      initRef.current = true;
      
      const initVoiceMode = async () => {
        try {
          console.log('Initializing voice mode...');
          await connect();
          await startCapture();
          console.log('Voice mode initialized');
        } catch (error) {
          console.error('Failed to initialize voice mode:', error);
          toast({
            title: 'Microphone Error',
            description: 'Could not access microphone. Please grant permission.',
            variant: 'destructive',
          });
          deactivateVoiceMode();
          initRef.current = false;
        }
      };

      initVoiceMode();
    }

    if (justDeactivated && initRef.current) {
      console.log('Deactivating voice mode...');
      stopLoadingMusic(); // Ensure music stops on deactivation
      stopCapture();
      stopPlayback();
      disconnect();
      initRef.current = false;

      // Get fresh conversation turns from store
      const { conversationTurns, clearConversation, attachImageToLastAssistantTurn } = useVoiceModeStore.getState();
      
      // Attach any pending image to the last assistant turn before saving
      attachImageToLastAssistantTurn();
      
      // Get updated turns after attaching image
      const { conversationTurns: finalTurns } = useVoiceModeStore.getState();
      
      // Save conversation to chat history (including images)
      if (finalTurns.length > 0) {
        console.log('Saving voice conversation:', finalTurns.length, 'turns');
        
        finalTurns.forEach((turn) => {
          if (turn.imageUrl) {
            // If this turn has an image, add the image first, then the text
            addMessage({
              content: turn.transcript,
              role: turn.role,
              type: 'image',
              imageUrl: turn.imageUrl,
            });
          } else {
            // Regular text message
            addMessage({
              content: turn.transcript,
              role: turn.role,
              type: 'text',
            });
          }
        });

        toast({
          title: 'Conversation saved',
          description: `${finalTurns.length} messages added to chat`,
        });
        
        clearConversation();
      }
    }
  }, [isActive, connect, disconnect, startCapture, stopCapture, stopPlayback, stopLoadingMusic, addMessage, toast, deactivateVoiceMode]);

  // Update voice when selection changes (only when connected)
  useEffect(() => {
    if (isConnected && selectedVoice !== previousVoiceRef.current) {
      console.log('Voice changed from', previousVoiceRef.current, 'to', selectedVoice);
      previousVoiceRef.current = selectedVoice;
      updateVoice(selectedVoice);
    }
  }, [selectedVoice, isConnected, updateVoice]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (initRef.current) {
        stopLoadingMusic();
        stopCapture();
        stopPlayback();
        disconnect();
        initRef.current = false;
      }
    };
  }, [stopCapture, stopPlayback, stopLoadingMusic, disconnect]);

  return null;
}
