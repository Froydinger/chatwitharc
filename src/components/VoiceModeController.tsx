import { useEffect, useRef, useCallback } from 'react';
import { useVoiceModeStore } from '@/store/useVoiceModeStore';
import { useOpenAIRealtime } from '@/hooks/useOpenAIRealtime';
import { useAudioCapture } from '@/hooks/useAudioCapture';
import { useAudioPlayback } from '@/hooks/useAudioPlayback';
import { useArcStore, Message } from '@/store/useArcStore';
import { useToast } from '@/hooks/use-toast';
import { AIService } from '@/services/ai';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/hooks/useProfile';
import { setGlobalInterruptHandler } from './VoiceModeOverlay';

const aiService = new AIService();

// Build a voice-optimized system prompt from the same source as regular chat
async function buildVoiceSystemPrompt(
  profile: { display_name?: string | null; context_info?: string | null; memory_info?: string | null } | null,
  recentChatSummary: string
): Promise<string> {
  try {
    // Fetch the same admin settings the regular chat uses
    const { data: settingsData } = await supabase
      .from('admin_settings')
      .select('key, value')
      .in('key', ['system_prompt', 'global_context']);

    const settings = settingsData?.reduce((acc, setting) => {
      acc[setting.key] = setting.value;
      return acc;
    }, {} as Record<string, string>) || {};

    let basePrompt = settings.system_prompt || 'You are Arc AI, a helpful assistant.';
    const globalContext = settings.global_context || '';

    // Add voice-specific adaptations while keeping the same personality
    let voicePrompt = basePrompt;
    
    // Add voice mode context
    voicePrompt += `\n\n--- VOICE MODE ---
You're now in voice conversation mode. Keep everything you know about being Arc, but adapt for spoken dialogue:
- Speak naturally and conversationally - this is a real-time voice chat
- Keep responses SHORT - 1-3 sentences usually
- React naturally like "oh nice!" or "hmm let me think..."
- Match the energy of whoever you're talking to
- Be warm, genuine, and present
- It's okay to pause and think`;

    // Add user context (same as regular chat)
    if (profile?.display_name) {
      voicePrompt += `\n\nUser: ${profile.display_name}`;
    }
    if (profile?.context_info?.trim()) {
      voicePrompt += ` | Context: ${profile.context_info}`;
    }
    if (profile?.memory_info?.trim()) {
      voicePrompt += `\n\n📝 Memories: ${profile.memory_info}`;
    }
    if (globalContext) {
      voicePrompt += `\n\nGlobal: ${globalContext}`;
    }

    // Add recent chat context if available
    if (recentChatSummary) {
      voicePrompt += `\n\n--- RECENT CHAT CONTEXT ---\n${recentChatSummary}`;
    }

    // Add voice-specific tools
    voicePrompt += `\n\n--- VOICE TOOLS ---
• IMAGE GENERATION: When user asks to create/draw/show an image, use generate_image. When done with image, use close_image.
• WEB SEARCH: For current events, news, scores, or real-time info, use web_search. Summarize results conversationally.
  CRITICAL: Listen VERY carefully to exact names, titles, and proper nouns. Common misheards:
  - "Win the Night" (a wellness podcast at winthenight.org) NOT "Wind of Change"
  - "Arc AI" or "Chat with Arc" (this app at chatwitharc.com)
  Before searching, confirm the exact term you heard if it sounds like a proper noun or title.`;

    return voicePrompt;
  } catch (error) {
    console.error('Failed to fetch voice system prompt:', error);
    // Fallback to a sensible default
    return `You're Arc - a calm, friendly voice assistant. Be warm, conversational, and keep responses concise.`;
  }
}

// Summarize recent chat messages for context
function summarizeRecentChats(messages: Message[], maxMessages = 20): string {
  if (!messages || messages.length === 0) return '';
  
  // Get the last N messages
  const recent = messages.slice(-maxMessages);
  
  // Create a brief summary
  const summary = recent.map(msg => {
    const role = msg.role === 'user' ? 'User' : 'You';
    // Truncate long messages
    const content = msg.content.length > 200 
      ? msg.content.substring(0, 200) + '...'
      : msg.content;
    return `${role}: ${content}`;
  }).join('\n');
  
  return `Here's what was discussed recently in our text chat (you can reference this naturally if relevant):\n${summary}`;
}
const LOADING_MUSIC_VOLUME = 0.14; // 14% volume for elevator music during loading

export function VoiceModeController() {
  const { toast } = useToast();
  const { addMessage, messages } = useArcStore();
  const { profile } = useProfile();
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
  
  // Abort controller for cancelling pending operations
  const abortControllerRef = useRef<AbortController | null>(null);

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

  // Web search handler with abort support
  const handleWebSearch = useCallback(async (query: string): Promise<string> => {
    console.log('VoiceModeController: Web search for:', query);
    
    // Check if voice mode is still active before starting
    if (!useVoiceModeStore.getState().isActive) {
      console.log('Voice mode inactive, aborting search');
      return 'Search cancelled.';
    }
    
    setIsSearching(true);
    startLoadingMusic(); // Play elevator music while searching
    
    // Create new abort controller for this search
    abortControllerRef.current = new AbortController();
    
    try {
      // Call the chat function with forceWebSearch to get real-time results
      // Use a timeout to prevent hanging
      const timeoutId = setTimeout(() => {
        abortControllerRef.current?.abort();
      }, 30000); // 30 second timeout
      
      const { data, error } = await supabase.functions.invoke('chat', {
        body: {
          messages: [{ role: 'user', content: query }],
          forceWebSearch: true
        }
      });
      
      clearTimeout(timeoutId);
      
      // Check if voice mode is still active after search completes
      if (!useVoiceModeStore.getState().isActive) {
        console.log('Voice mode deactivated during search, discarding results');
        stopLoadingMusic();
        setIsSearching(false);
        return 'Search completed but voice mode ended.';
      }
      
      stopLoadingMusic();
      setIsSearching(false);
      
      if (error) {
        console.error('Web search error:', error);
        // Return error message instead of throwing - keeps voice mode alive
        return `I couldn't complete the search right now. The error was: ${error.message}. Would you like me to try again?`;
      }
      
      // Return the AI's response which includes web search results
      const response = data?.choices?.[0]?.message?.content || 'No results found for that search.';
      console.log('VoiceModeController: Web search complete');
      return response;
    } catch (error: any) {
      console.error('VoiceModeController: Web search failed:', error);
      stopLoadingMusic();
      setIsSearching(false);
      
      // Return error message instead of throwing - keeps voice mode alive
      if (error.name === 'AbortError') {
        return 'The search took too long and was cancelled. Would you like me to try a simpler search?';
      }
      return `I ran into a problem searching for that: ${error.message || 'Unknown error'}. Want me to try again?`;
    }
  }, [setIsSearching, startLoadingMusic, stopLoadingMusic]);

  // OpenAI Realtime connection
  const { isConnected, connect, disconnect, sendAudio, updateVoice, cancelResponse } = useOpenAIRealtime({
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

  // Manual interrupt handler for the UI button
  const handleManualInterrupt = useCallback(() => {
    console.log('Manual interrupt triggered');
    cancelResponse();
    clearQueue();
    useVoiceModeStore.getState().setStatus('listening');
  }, [cancelResponse, clearQueue]);

  // Register the interrupt handler globally so VoiceModeOverlay can use it
  useEffect(() => {
    setGlobalInterruptHandler(handleManualInterrupt);
    return () => {
      setGlobalInterruptHandler(null);
    };
  }, [handleManualInterrupt]);

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
          
          // Build the system prompt with same personality as regular chat + chat history
          const recentChatSummary = summarizeRecentChats(messages);
          const voiceSystemPrompt = await buildVoiceSystemPrompt(profile, recentChatSummary);
          console.log('Voice mode using unified system prompt with chat context');
          
          await connect(voiceSystemPrompt);
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
      
      // Abort any pending operations first
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      
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
  }, [isActive, connect, disconnect, startCapture, stopCapture, stopPlayback, stopLoadingMusic, addMessage, toast, deactivateVoiceMode, messages, profile]);

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
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
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
