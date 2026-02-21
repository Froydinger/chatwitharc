import { useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useVoiceModeStore, REALTIME_SUPPORTED_VOICES, VoiceName } from '@/store/useVoiceModeStore';
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
  setGlobalSwitchCameraHandler,
  setGlobalVoiceSwitchHandler
} from './VoiceModeOverlay';

const aiService = new AIService();

// Fast database-level search through past chat sessions
async function searchAllPastChats(query: string): Promise<string> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 'Unable to access chat history - not authenticated.';

    console.log('⚡ Using fast database-level search for:', query);
    const startTime = Date.now();

    const { data: sessions, error } = await supabase
      .rpc('search_chat_sessions', {
        search_query: query,
        searching_user_id: user.id,
        max_sessions: 100
      });

    if (error) {
      console.error('Fast search failed, falling back:', error);
      return await fallbackSearch(query, user.id);
    }

    console.log(`⚡ Database search completed in ${Date.now() - startTime}ms, found ${sessions?.length || 0} matching sessions`);

    if (!sessions || sessions.length === 0) {
      return `I searched through your conversations but didn't find anything specifically about "${query}".`;
    }

    const relevantSessions: string[] = [];
    let totalMessages = 0;
    let totalCharacters = 0;
    const CHARACTER_BUDGET = 500000;

    for (const session of sessions) {
      const messages = Array.isArray(session.messages) ? session.messages : [];
      if (messages.length === 0) continue;

      const sessionDate = new Date(session.updated_at).toLocaleDateString();
      const sessionTitle = session.title || 'Untitled Chat';

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

async function fallbackSearch(query: string, userId: string): Promise<string> {
  console.log('Using fallback client-side search');
  
  const { data: sessions, error } = await supabase
    .from('chat_sessions')
    .select('title, messages, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(50);

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

async function buildVoiceSystemPrompt(
  profile: { display_name?: string | null; context_info?: string | null; memory_info?: string | null } | null,
  recentChatSummary: string
): Promise<string> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const [settingsResult, contextBlocksResult] = await Promise.all([
      supabase
        .from('admin_settings')
        .select('key, value')
        .in('key', ['system_prompt', 'global_context']),
      user ? supabase
        .from('context_blocks')
        .select('content')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50) : Promise.resolve({ data: null })
    ]);

    const settingsData = settingsResult.data;

    const settings = settingsData?.reduce((acc, setting) => {
      acc[setting.key] = setting.value;
      return acc;
    }, {} as Record<string, string>) || {};

    let basePrompt = settings.system_prompt || 'You are Arc AI, a helpful assistant.';
    const globalContext = settings.global_context || '';

    let voicePrompt = basePrompt;
    
    voicePrompt += `\n\n--- VOICE MODE ---
This is a chill voice chat. Drop the formality, just talk like you're hanging with a friend:
- Be casual and real - say "yeah" not "yes", "gonna" not "going to", etc.
- Keep it brief - like 1-2 sentences max unless they want more
- React naturally: "oh that's cool", "hm interesting", "wait really?"
- Match their vibe - if they're hyped, get hyped. If they're chill, be chill.
- Don't over-explain or be preachy. Just chat.
- Silence is fine. You don't need to fill every gap.`;

    if (profile?.display_name) {
      voicePrompt += `\n\nUser: ${profile.display_name}`;
    }
    if (profile?.context_info?.trim()) {
      voicePrompt += ` | Context: ${profile.context_info}`;
    }
    if (contextBlocksResult.data && contextBlocksResult.data.length > 0) {
      const blocksText = contextBlocksResult.data.map((b: any) => b.content).join('\n');
      voicePrompt += `\n\n🧠 Remembered Context:\n${blocksText}`;
    }
    if (profile?.memory_info?.trim()) {
      voicePrompt += `\n\n📝 Memories: ${profile.memory_info}`;
    }
    if (globalContext) {
      voicePrompt += `\n\nGlobal: ${globalContext}`;
    }

    if (recentChatSummary) {
      voicePrompt += `\n\n--- CURRENT SESSION CONTEXT ---\n${recentChatSummary}`;
    }

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
    return `You're Arc - a calm, friendly voice assistant. Be warm, conversational, and keep responses concise.`;
  }
}

function summarizeRecentChats(messages: Message[], maxMessages = 20): string {
  if (!messages || messages.length === 0) return '';
  
  const recent = messages.slice(-maxMessages);
  
  const summary = recent.map(msg => {
    const role = msg.role === 'user' ? 'User' : 'You';
    const content = msg.content.length > 200 
      ? msg.content.substring(0, 200) + '...'
      : msg.content;
    return `${role}: ${content}`;
  }).join('\n');
  
  return `Here's what was discussed recently in our text chat (you can reference this naturally if relevant):\n${summary}`;
}

// How many turns we've already persisted (incremental save pointer)
let savedTurnIndex = 0;

export function VoiceModeController() {
  const { toast } = useToast();
  const { addMessage, messages } = useArcStore();
  const { profile, updateProfile } = useProfile();
  const {
    isActive,
    selectedVoice,
    setSelectedVoice,
    deactivateVoiceMode,
    activateVoiceMode,
    setGeneratedImage,
    setIsGeneratingImage,
    setLastGeneratedImageUrl,
    setIsSearching,
  } = useVoiceModeStore();

  // Sync preferred_voice from profile to store on load
  useEffect(() => {
    if (profile?.preferred_voice && profile.preferred_voice !== selectedVoice) {
      if (REALTIME_SUPPORTED_VOICES.includes(profile.preferred_voice as any)) {
        setSelectedVoice(profile.preferred_voice as any);
      }
    }
  }, [profile?.preferred_voice]);

  // Track initialization to prevent duplicate setup
  const initRef = useRef(false);
  const wasActiveRef = useRef(false);
  
  // Abort controller for cancelling pending operations
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Auto-save interval ref
  const autoSaveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Audio playback for AI responses
  const { queueAudio, stopPlayback, clearQueue } = useAudioPlayback();

  // Image generation handler
  const handleImageGenerate = useCallback(async (prompt: string, aspectRatio?: string): Promise<string> => {
    console.log('VoiceModeController: Generating image with prompt:', prompt, 'aspect ratio:', aspectRatio);
    setIsGeneratingImage(true);
    
    try {
      const imageUrl = await aiService.generateImage(prompt, undefined, aspectRatio);
      console.log('VoiceModeController: Image generated:', imageUrl);
      setGeneratedImage(imageUrl);
      setLastGeneratedImageUrl(imageUrl);
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

  // Web search handler with abort support
  const handleWebSearch = useCallback(async (query: string): Promise<string> => {
    console.log('VoiceModeController: Web search for:', query);
    
    if (!useVoiceModeStore.getState().isActive) {
      console.log('Voice mode inactive, aborting search');
      return 'Search cancelled.';
    }
    
    setIsSearching(true);
    
    abortControllerRef.current = new AbortController();
    
    try {
      const timeoutId = setTimeout(() => {
        abortControllerRef.current?.abort();
      }, 30000);
      
      const { data, error } = await supabase.functions.invoke('chat', {
        body: {
          messages: [{ role: 'user', content: query }],
          forceWebSearch: true
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!useVoiceModeStore.getState().isActive) {
        console.log('Voice mode deactivated during search, discarding results');
        setIsSearching(false);
        return 'Search completed but voice mode ended.';
      }
      
      setIsSearching(false);
      
      if (error) {
        console.error('Web search error:', error);
        return `I couldn't complete the search right now. The error was: ${error.message}. Would you like me to try again?`;
      }
      
      const response = data?.choices?.[0]?.message?.content || 'No results found for that search.';
      console.log('VoiceModeController: Web search complete');
      return response;
    } catch (error: any) {
      console.error('VoiceModeController: Web search failed:', error);
      setIsSearching(false);
      
      if (error.name === 'AbortError') {
        return 'The search took too long and was cancelled. Would you like me to try a simpler search?';
      }
      return `I ran into a problem searching for that: ${error.message || 'Unknown error'}. Want me to try again?`;
    }
  }, [setIsSearching]);

  // Past chats search handler
  const handleSearchPastChats = useCallback(async (query: string): Promise<string> => {
    console.log('VoiceModeController: Searching past chats for:', query);

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
  const { isConnected, connect, disconnect, sendAudio, sendImage, cancelResponse, commitAudioAndRespond } = useOpenAIRealtime({
    onAudioData: (audioData) => {
      queueAudio(audioData);
    },
    onInterrupt: () => {
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
  const MIN_FRAME_INTERVAL_MS = 2000;

  // Camera frame handler
  const handleCameraFrame = useCallback((base64Image: string) => {
    const now = Date.now();
    if (now - lastFrameSentRef.current < MIN_FRAME_INTERVAL_MS) return;
    lastFrameSentRef.current = now;
    
    if (isConnected) {
      console.log('Sending camera frame to AI');
      sendImage(base64Image, true);
    }
  }, [isConnected, sendImage]);

  // Camera capture hook
  const { videoRef, switchCamera, stopCapture: stopCameraCapture } = useCameraCapture({
    onFrame: handleCameraFrame,
    frameRate: 2,
    maxSize: 512,
    quality: 0.7,
  });

  // Export commitAudioAndRespond for the overlay's mute button to use
  const commitAudioAndRespondRef = useRef(commitAudioAndRespond);
  commitAudioAndRespondRef.current = commitAudioAndRespond;

  // Manual interrupt handler
  const handleManualInterrupt = useCallback(() => {
    console.log('Manual interrupt triggered via button');
    cancelResponse();
    clearQueue();
    stopPlayback();
    const store = useVoiceModeStore.getState();
    store.setStatus('listening');
    store.setIsAudioPlaying(false);
    store.setIsGeneratingImage(false);
    store.setIsSearching(false);
  }, [cancelResponse, clearQueue, stopPlayback]);

  // Register the interrupt handler globally
  useLayoutEffect(() => {
    setGlobalInterruptHandler(handleManualInterrupt);
    return () => { setGlobalInterruptHandler(null); };
  }, [handleManualInterrupt]);

  // Register the mute-handoff handler globally
  useLayoutEffect(() => {
    setGlobalMuteHandoffHandler(commitAudioAndRespond);
    return () => { setGlobalMuteHandoffHandler(null); };
  }, [commitAudioAndRespond]);

  // Register the video ref globally for the overlay to display
  useLayoutEffect(() => {
    setGlobalVideoRef(videoRef);
    return () => { setGlobalVideoRef(null); };
  }, [videoRef]);

  // Register the switch camera handler globally
  useLayoutEffect(() => {
    setGlobalSwitchCameraHandler(switchCamera);
    return () => { setGlobalSwitchCameraHandler(null); };
  }, [switchCamera]);

  // Incremental save: persist new turns since last save
  const saveNewTurns = useCallback(async (final: boolean = false) => {
    const { conversationTurns, attachImageToLastAssistantTurn } = useVoiceModeStore.getState();
    
    if (final) attachImageToLastAssistantTurn();
    
    const { conversationTurns: currentTurns } = useVoiceModeStore.getState();
    const turnsToSave = currentTurns
      .slice(savedTurnIndex)
      .filter(turn => turn.transcript.trim() || turn.imageUrl);
    
    if (turnsToSave.length === 0) return 0;
    
    console.log(`💾 Saving ${turnsToSave.length} new voice turns (index ${savedTurnIndex}→${savedTurnIndex + turnsToSave.length})`);
    
    const savePromises = turnsToSave.map(async (turn) => {
      try {
        if (turn.imageUrl) {
          await addMessage({
            content: turn.transcript || 'Generated image',
            role: turn.role,
            type: 'image',
            imageUrl: turn.imageUrl,
          });
        } else if (turn.transcript.trim()) {
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
    
    await Promise.all(savePromises);
    savedTurnIndex = currentTurns.length;
    return turnsToSave.length;
  }, [addMessage]);

  // Voice switch handler: save turns, deactivate, switch voice, reactivate
  const handleVoiceSwitch = useCallback(async (newVoice: VoiceName) => {
    console.log('Voice switch requested:', newVoice);
    
    // 1. Save current conversation turns
    await saveNewTurns(true);
    const turnCount = savedTurnIndex;
    
    // 2. Deactivate voice mode (triggers full cleanup via the isActive effect)
    deactivateVoiceMode();
    
    // 3. Set the new voice and persist
    setSelectedVoice(newVoice);
    try {
      await updateProfile({ preferred_voice: newVoice });
    } catch (err) {
      console.error('Failed to persist voice:', err);
    }
    
    // 4. Wait for cleanup to complete, then reactivate
    await new Promise(resolve => setTimeout(resolve, 600));
    
    activateVoiceMode();
    
    const voiceName = REALTIME_SUPPORTED_VOICES.includes(newVoice) 
      ? newVoice.charAt(0).toUpperCase() + newVoice.slice(1)
      : newVoice;
    
    toast({
      title: `Switched to ${voiceName}`,
      description: turnCount > 0 
        ? `Previous conversation saved (${turnCount} messages)`
        : 'Starting fresh conversation',
    });
  }, [saveNewTurns, deactivateVoiceMode, setSelectedVoice, activateVoiceMode, updateProfile, toast]);

  // Register voice switch handler globally
  useLayoutEffect(() => {
    setGlobalVoiceSwitchHandler(handleVoiceSwitch);
    return () => { setGlobalVoiceSwitchHandler(null); };
  }, [handleVoiceSwitch]);

  // Handle attached image
  const { attachedImage, clearAttachment } = useVoiceModeStore();
  const sentAttachmentRef = useRef<string | null>(null);

  useEffect(() => {
    if (attachedImage && attachedImage !== sentAttachmentRef.current && isConnected) {
      console.log('Sending attached image to AI');
      sendImage(attachedImage, false);
      sentAttachmentRef.current = attachedImage;
    }
    
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
      savedTurnIndex = 0;
      
      const initVoiceMode = async () => {
        try {
          console.log('Initializing voice mode...');

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
      
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current);
        autoSaveIntervalRef.current = null;
      }
      
      stopCapture();
      stopCameraCapture();
      stopPlayback();
      disconnect();
      initRef.current = false;

      // Final save of any remaining turns
      saveNewTurns(true).then((count) => {
        if (count > 0 || savedTurnIndex > 0) {
          console.log(`✅ Voice conversation fully saved (${savedTurnIndex} total turns)`);
          toast({
            title: 'Conversation saved',
            description: `${savedTurnIndex} messages added to chat`,
          });
        }
        
        useVoiceModeStore.getState().clearConversation();
        savedTurnIndex = 0;
      });
    }
  }, [isActive, connect, disconnect, startCapture, stopCapture, stopCameraCapture, stopPlayback, addMessage, toast, deactivateVoiceMode, messages, profile, saveNewTurns]);

  // Periodic auto-save every 60s during active voice mode
  useEffect(() => {
    if (isActive) {
      autoSaveIntervalRef.current = setInterval(() => {
        saveNewTurns(false).then((count) => {
          if (count > 0) console.log(`⏱️ Auto-saved ${count} voice turns`);
        });
      }, 60000);
      
      return () => {
        if (autoSaveIntervalRef.current) {
          clearInterval(autoSaveIntervalRef.current);
          autoSaveIntervalRef.current = null;
        }
      };
    }
  }, [isActive, saveNewTurns]);

  // Emergency save on page hide (iOS kills backgrounded tabs)
  useEffect(() => {
    const handlePageHide = () => {
      if (!useVoiceModeStore.getState().isActive) return;
      console.log('🚨 Page hiding — emergency saving voice turns');
      const { conversationTurns } = useVoiceModeStore.getState();
      const unsaved = conversationTurns.slice(savedTurnIndex).filter(t => t.transcript.trim() || t.imageUrl);
      if (unsaved.length > 0) {
        unsaved.forEach(turn => {
          try {
            addMessage({
              content: turn.imageUrl ? (turn.transcript || 'Generated image') : turn.transcript,
              role: turn.role,
              type: turn.imageUrl ? 'image' : 'text',
              imageUrl: turn.imageUrl,
            });
          } catch (_) {}
        });
        savedTurnIndex = conversationTurns.length;
      }
    };

    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') handlePageHide();
    });

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [addMessage]);

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
