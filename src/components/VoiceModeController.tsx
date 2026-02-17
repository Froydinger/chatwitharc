import { useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useVoiceModeStore } from '@/store/useVoiceModeStore';
import { useOpenAIRealtime } from '@/hooks/useOpenAIRealtime';
import { useAudioCapture } from '@/hooks/useAudioCapture';
import { useAudioPlayback } from '@/hooks/useAudioPlayback';
import { useCameraCapture } from '@/hooks/useCameraCapture';
import { useArcStore, Message } from '@/store/useArcStore';
import { useToast } from '@/hooks/use-toast';
import { AIService } from '@/services/ai';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/hooks/useProfile';
import { 
  setGlobalInterruptHandler, 
  setGlobalMuteHandoffHandler, 
  setGlobalVideoRef,
  setGlobalSwitchCameraHandler 
} from './VoiceModeOverlay';

const aiService = new AIService();

// Fast database-level search through past chat sessions
async function searchAllPastChats(query: string): Promise<string> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 'Unable to access chat history - not authenticated.';

    console.log('⚡ Using fast database-level search for:', query);
    const startTime = Date.now();

    // Use database function for fast full-text search (searches at DB level, not client)
    const { data: sessions, error } = await supabase
      .rpc('search_chat_sessions', {
        search_query: query,
        searching_user_id: user.id,
        max_sessions: 100 // Get top 100 matching sessions
      });

    if (error) {
      console.error('Fast search failed, falling back:', error);
      // Fallback to basic search if RPC fails
      return await fallbackSearch(query, user.id);
    }

    console.log(`⚡ Database search completed in ${Date.now() - startTime}ms, found ${sessions?.length || 0} matching sessions`);

    if (!sessions || sessions.length === 0) {
      return `I searched through your conversations but didn't find anything specifically about "${query}".`;
    }

    // Build context from pre-filtered sessions (already relevant!)
    const relevantSessions: string[] = [];
    let totalMessages = 0;
    let totalCharacters = 0;
    const CHARACTER_BUDGET = 500000; // ~125k tokens - safe for all models

    for (const session of sessions) {
      const messages = Array.isArray(session.messages) ? session.messages : [];
      if (messages.length === 0) continue;

      const sessionDate = new Date(session.updated_at).toLocaleDateString();
      const sessionTitle = session.title || 'Untitled Chat';

      // Include full messages - no truncation
      const messagesSummary = messages
        .filter((m: any) => m.content && m.content.length > 5)
        .map((m: any) => {
          const role = m.role === 'user' ? 'User' : 'Arc';
          return `${role}: ${m.content}`;
        })
        .join('\n');

      if (messagesSummary) {
        if (totalCharacters + messagesSummary.length > CHARACTER_BUDGET) {
          console.log(`Past chat search hit budget limit at ${relevantSessions.length} sessions, ${totalCharacters} chars`);
          break;
        }
        
        relevantSessions.push(`--- "${sessionTitle}" (${sessionDate}) ---\n${messagesSummary}`);
        totalMessages += messages.length;
        totalCharacters += messagesSummary.length;
      }
    }

    if (relevantSessions.length === 0) {
      return `I searched through your conversations but didn't find anything specifically about "${query}".`;
    }

    return `I found ${relevantSessions.length} relevant conversations (${totalMessages} total messages) about "${query}":\n\n${relevantSessions.join('\n\n')}`;
  } catch (error) {
    console.error('Failed to search past chats:', error);
    return 'Unable to search past chats right now due to an error.';
  }
}

// Fallback search if database function isn't available
async function fallbackSearch(query: string, userId: string): Promise<string> {
  console.log('Using fallback client-side search');
  
  const { data: sessions, error } = await supabase
    .from('chat_sessions')
    .select('title, messages, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(50); // Smaller limit for fallback

  if (error || !sessions || sessions.length === 0) {
    return 'No past conversations found to search through.';
  }

  const queryLower = query.toLowerCase();
  const relevantSessions: string[] = [];

  for (const session of sessions) {
    const messages = Array.isArray(session.messages) ? session.messages : [];
    const hasMatch = messages.some((m: any) => 
      m.content?.toLowerCase().includes(queryLower)
    );

    if (hasMatch || sessions.indexOf(session) < 5) {
      const sessionDate = new Date(session.updated_at).toLocaleDateString();
      const sessionTitle = session.title || 'Untitled Chat';
      const messagesSummary = messages
        .slice(-10)
        .filter((m: any) => m.content)
        .map((m: any) => `${m.role === 'user' ? 'User' : 'Arc'}: ${m.content.slice(0, 200)}`)
        .join('\n');

      if (messagesSummary) {
        relevantSessions.push(`--- "${sessionTitle}" (${sessionDate}) ---\n${messagesSummary}`);
      }
    }

    if (relevantSessions.length >= 20) break;
  }

  return relevantSessions.length > 0
    ? `Found ${relevantSessions.length} conversations:\n\n${relevantSessions.join('\n\n')}`
    : `No conversations found about "${query}".`;
}

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
    
    // Add voice mode context - relaxed, casual tone
    voicePrompt += `\n\n--- VOICE MODE ---
This is a chill voice chat. Drop the formality, just talk like you're hanging with a friend:
- Be casual and real - say "yeah" not "yes", "gonna" not "going to", etc.
- Keep it brief - like 1-2 sentences max unless they want more
- React naturally: "oh that's cool", "hm interesting", "wait really?"
- Match their vibe - if they're hyped, get hyped. If they're chill, be chill.
- Don't over-explain or be preachy. Just chat.
- Silence is fine. You don't need to fill every gap.`;

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

    // Add recent chat context if available (current session)
    if (recentChatSummary) {
      voicePrompt += `\n\n--- CURRENT SESSION CONTEXT ---\n${recentChatSummary}`;
    }

    // Add voice-specific tools
    voicePrompt += `\n\n--- VOICE TOOLS ---
CRITICAL: Always say something BEFORE using any tool so the user isn't left in silence.

• IMAGE GENERATION: Say "Let me create that for you" or "I'll whip that up" FIRST, then use generate_image. When done, use close_image if user is done with it.
• WEB SEARCH: Say "Let me look that up" or "I'll search for that" FIRST, then use web_search. Summarize results conversationally after.
  IMPORTANT: Listen carefully to exact names and titles. If unsure, confirm before searching.
• SEARCH PAST CHATS: Say "Let me check our past conversations" FIRST, then use search_past_chats when they ask about:
  - Something they mentioned before
  - Their preferences, interests, or patterns
  - Past topics or discussions
  This searches ALL past chats dynamically.`;

    // Add vision capabilities section
    voicePrompt += `\n\n--- VISION CAPABILITIES ---
When the user shares their camera or attaches an image:
• You can see what they're showing you through images sent to this conversation
• Describe what you see naturally and conversationally
• Point out interesting details they might want to know about
• Answer questions about the visual content
• If camera is live, acknowledge motion or changes when relevant
• For attached images, offer to analyze specific parts if needed
• Be helpful but not overly verbose about what you see

If a user says something like "edit this" or asks to modify an image:
• Ask what changes they'd like if not specified
• Use generate_image with a prompt that describes the desired edit
• The image editing system can handle style changes, modifications, additions, etc.`;

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

export function VoiceModeController() {
  const { toast } = useToast();
  const { addMessage, messages } = useArcStore();
  const { profile } = useProfile();
  const {
    isActive,
    selectedVoice,
    setSelectedVoice,
    deactivateVoiceMode,
    setGeneratedImage,
    setIsGeneratingImage,
    setLastGeneratedImageUrl,
    setIsSearching,
  } = useVoiceModeStore();

  // Sync preferred_voice from profile to store on load
  useEffect(() => {
    if (profile?.preferred_voice && profile.preferred_voice !== selectedVoice) {
      // Validate it's a known voice
      const validVoices = ['alloy','ash','ballad','cedar','coral','echo','fable','marin','nova','onyx','sage','shimmer','verse'];
      if (validVoices.includes(profile.preferred_voice)) {
        setSelectedVoice(profile.preferred_voice as any);
      }
    }
  }, [profile?.preferred_voice]);

  // Track initialization to prevent duplicate setup
  const initRef = useRef(false);
  const wasActiveRef = useRef(false);
  const previousVoiceRef = useRef(selectedVoice);
  
  // Abort controller for cancelling pending operations
  const abortControllerRef = useRef<AbortController | null>(null);

  // Audio playback for AI responses
  const { queueAudio, stopPlayback, clearQueue } = useAudioPlayback();

  // Image generation handler - with aspect ratio support, always uses Gemini 3 Pro
  const handleImageGenerate = useCallback(async (prompt: string, aspectRatio?: string): Promise<string> => {
    console.log('VoiceModeController: Generating image with prompt:', prompt, 'aspect ratio:', aspectRatio);
    setIsGeneratingImage(true);
    
    try {
      // Force Gemini 3 Pro for voice mode image generation (pass undefined to use default Pro)
      const imageUrl = await aiService.generateImage(prompt, undefined, aspectRatio);
      console.log('VoiceModeController: Image generated:', imageUrl);
      setGeneratedImage(imageUrl);
      setLastGeneratedImageUrl(imageUrl); // Track for attaching to conversation
      setIsGeneratingImage(false);
      return imageUrl;
    } catch (error) {
      console.error('VoiceModeController: Image generation failed:', error);
      setIsGeneratingImage(false);
      throw error;
    }
  }, [setGeneratedImage, setIsGeneratingImage, setLastGeneratedImageUrl]);

  // Image dismiss handler
  const handleImageDismiss = useCallback(() => {
    console.log('VoiceModeController: Dismissing image');
    setGeneratedImage(null);
  }, [setGeneratedImage]);

  // Web search handler with abort support - NO music
  const handleWebSearch = useCallback(async (query: string): Promise<string> => {
    console.log('VoiceModeController: Web search for:', query);
    
    // Check if voice mode is still active before starting
    if (!useVoiceModeStore.getState().isActive) {
      console.log('Voice mode inactive, aborting search');
      return 'Search cancelled.';
    }
    
    setIsSearching(true);
    
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
        setIsSearching(false);
        return 'Search completed but voice mode ended.';
      }
      
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
      setIsSearching(false);
      
      // Return error message instead of throwing - keeps voice mode alive
      if (error.name === 'AbortError') {
        return 'The search took too long and was cancelled. Would you like me to try a simpler search?';
      }
      return `I ran into a problem searching for that: ${error.message || 'Unknown error'}. Want me to try again?`;
    }
  }, [setIsSearching]);

  // Past chats search handler - dynamic search through all history
  const handleSearchPastChats = useCallback(async (query: string): Promise<string> => {
    console.log('VoiceModeController: Searching past chats for:', query);

    // Check if voice mode is still active before starting
    if (!useVoiceModeStore.getState().isActive) {
      console.log('Voice mode inactive, aborting past chat search');
      return 'Search cancelled.';
    }

    setIsSearching(true);

    try {
      const results = await searchAllPastChats(query);
      console.log('VoiceModeController: Past chat search complete');
      setIsSearching(false);
      return results;
    } catch (error: any) {
      console.error('VoiceModeController: Past chat search failed:', error);
      setIsSearching(false);
      return `I had trouble searching through past conversations: ${error.message || 'Unknown error'}`;
    }
  }, [setIsSearching]);

  // OpenAI Realtime connection
  const { isConnected, connect, disconnect, sendAudio, sendImage, updateVoice, cancelResponse, commitAudioAndRespond } = useOpenAIRealtime({
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
    onSearchPastChats: handleSearchPastChats,
  });

  // Track when we last sent a camera frame to throttle
  const lastFrameSentRef = useRef<number>(0);
  const MIN_FRAME_INTERVAL_MS = 2000; // Send at most every 2 seconds

  // Camera frame handler - sends frames to OpenAI for vision
  const handleCameraFrame = useCallback((base64Image: string) => {
    // Throttle frame sending
    const now = Date.now();
    if (now - lastFrameSentRef.current < MIN_FRAME_INTERVAL_MS) return;
    lastFrameSentRef.current = now;
    
    // Only send if connected
    if (isConnected) {
      console.log('Sending camera frame to AI');
      sendImage(base64Image, true); // isLiveCamera = true
    }
  }, [isConnected, sendImage]);

  // Camera capture hook
  const { videoRef, switchCamera, stopCapture: stopCameraCapture } = useCameraCapture({
    onFrame: handleCameraFrame,
    frameRate: 2, // 2 fps
    maxSize: 512, // Max 512px on longest edge
    quality: 0.7, // 70% JPEG quality
  });

  // Export commitAudioAndRespond for the overlay's mute button to use
  const commitAudioAndRespondRef = useRef(commitAudioAndRespond);
  commitAudioAndRespondRef.current = commitAudioAndRespond;

  // Manual interrupt handler for the big centered button
  const handleManualInterrupt = useCallback(() => {
    console.log('Manual interrupt triggered via button');
    cancelResponse();
    clearQueue();
    stopPlayback();
    // Reset ALL relevant states to properly resume listening
    const store = useVoiceModeStore.getState();
    store.setStatus('listening');
    store.setIsAudioPlaying(false);
    store.setIsGeneratingImage(false);
    store.setIsSearching(false);
  }, [cancelResponse, clearQueue, stopPlayback]);

  // Register the interrupt handler globally so VoiceModeOverlay button can use it
  useLayoutEffect(() => {
    setGlobalInterruptHandler(handleManualInterrupt);
    return () => {
      setGlobalInterruptHandler(null);
    };
  }, [handleManualInterrupt]);

  // Register the mute-handoff handler globally
  useLayoutEffect(() => {
    setGlobalMuteHandoffHandler(commitAudioAndRespond);
    return () => {
      setGlobalMuteHandoffHandler(null);
    };
  }, [commitAudioAndRespond]);

  // Register the video ref globally for the overlay to display
  useLayoutEffect(() => {
    setGlobalVideoRef(videoRef);
    return () => {
      setGlobalVideoRef(null);
    };
  }, [videoRef]);

  // Register the switch camera handler globally
  useLayoutEffect(() => {
    setGlobalSwitchCameraHandler(switchCamera);
    return () => {
      setGlobalSwitchCameraHandler(null);
    };
  }, [switchCamera]);

  // Handle attached image - send to AI when attached
  const { attachedImage, clearAttachment } = useVoiceModeStore();
  const sentAttachmentRef = useRef<string | null>(null);

  useEffect(() => {
    // When a new attachment is added, send it to the AI
    if (attachedImage && attachedImage !== sentAttachmentRef.current && isConnected) {
      console.log('Sending attached image to AI');
      sendImage(attachedImage, false); // isLiveCamera = false (triggers response)
      sentAttachmentRef.current = attachedImage;
    }
    
    // Reset ref when attachment is cleared
    if (!attachedImage) {
      sentAttachmentRef.current = null;
    }
  }, [attachedImage, isConnected, sendImage]);

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

          // Build the system prompt with same personality as regular chat
          // Past chat history is now accessed dynamically via search_past_chats tool
          const recentChatSummary = summarizeRecentChats(messages);
          const voiceSystemPrompt = await buildVoiceSystemPrompt(profile, recentChatSummary);
          console.log('Voice mode using unified system prompt with dynamic chat search');

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
      
      // Stop all captures
      stopCapture();
      stopCameraCapture();
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
      // Filter out empty transcripts but keep turns with images
      const turnsToSave = finalTurns.filter(turn => 
        turn.transcript.trim() || turn.imageUrl
      );
      
      if (turnsToSave.length > 0) {
        console.log('Saving voice conversation:', turnsToSave.length, 'turns (filtered from', finalTurns.length, ')');
        
        // Use Promise.all to ensure all messages are saved
        const savePromises = turnsToSave.map(async (turn) => {
          try {
            if (turn.imageUrl) {
              // If this turn has an image, add the image message
              await addMessage({
                content: turn.transcript || 'Generated image',
                role: turn.role,
                type: 'image',
                imageUrl: turn.imageUrl,
              });
            } else if (turn.transcript.trim()) {
              // Regular text message
              await addMessage({
                content: turn.transcript,
                role: turn.role,
                type: 'text',
              });
            }
          } catch (error) {
            console.error('Failed to save voice turn:', error);
          }
        });
        
        // Wait for all saves to complete
        Promise.all(savePromises).then(() => {
          console.log('✅ All voice conversation turns saved');
        });

        toast({
          title: 'Conversation saved',
          description: `${turnsToSave.length} messages added to chat`,
        });
        
        clearConversation();
      } else {
        console.log('No voice conversation turns to save');
      }
    }
  }, [isActive, connect, disconnect, startCapture, stopCapture, stopCameraCapture, stopPlayback, addMessage, toast, deactivateVoiceMode, messages, profile]);

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
        stopCapture();
        stopCameraCapture();
        stopPlayback();
        disconnect();
        initRef.current = false;
      }
    };
  }, [stopCapture, stopCameraCapture, stopPlayback, disconnect]);

  return null;
}
