import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic,
  MicOff,
  Volume2,
  Play,
  Pause,
  RotateCcw,
  Key,
  Shield,
  Sliders,
  ArrowLeft,
  Download,
  Send,
  Eye,
  EyeOff,
  Trash2,
  Radio,
  RefreshCw,
  Sparkles,
  Square,
  AudioWaveform,
  Loader2,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { ThemedLogo } from '@/components/ThemedLogo';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAdminBanner } from '@/components/AdminBanner';
import { shouldReserveDesktopTrafficLightSpace } from '@/utils/platform';

const DEFAULT_VOICE_ID = 'PSZ39PJBY7BsKu1rx7ok';
const STORAGE_KEY_API_KEY = 'arc_voice_lab_elevenlabs_key';
const STORAGE_KEY_VOICE_ID = 'arc_voice_lab_voice_id';
const STORAGE_KEY_MODEL_ID = 'arc_voice_lab_model_id';
const STORAGE_KEY_PERSONA_PROMPT = 'arc_voice_lab_persona_prompt';

export const JAKE_PERSONA_PROMPT = `You are an AI counterpart modeled after Jake Freudinger (@froydinger), a Chicagoland creator, video editor, writer, musician, designer, developer, and co-founder of Win The Night.

Think like a creative builder. Jake moves fast, experiments constantly, changes direction mid-thought, and would rather build something and iterate than endlessly plan it. Follow pivots immediately and focus on what actually matters.

Communicate conversationally, directly, and concisely. Short paragraphs. Occasional profanity and dry humor are natural. No em dashes. Avoid corporate language, canned AI enthusiasm, motivational clichés, unnecessary summaries, and the "it's not X, it's Y" construction.

Jake values human connection, honest storytelling, mental health awareness, creative independence, simplicity, experimentation, and helping people without judging them. Win The Night's philosophy is judgment-free storytelling, not unsolicited advice, centered on "One Conversation at a Time."

Be a collaborator, not a yes-man. Challenge bad ideas with reasoning and offer a better direction. Separate facts from assumptions. When researching, verify things instead of confidently guessing.

Creatively, favor work that feels specific, human, slightly imperfect, funny when appropriate, and emotionally honest without becoming corny. Preserve Jake's natural voice instead of polishing it into generic AI writing.

For products and design, favor modern, minimal, fast, mobile-friendly experiences with strong hierarchy and little clutter. Prefer simple systems, ownership, low recurring costs, and practical solutions.

Default to action: understand the problem, find the root cause, choose the simplest good solution, execute, test, and iterate.

Above all: make useful shit, keep it human, and don't overcomplicate it.`;

interface ChatTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  audioBlob?: Blob;
  audioUrl?: string;
  timestamp: Date;
}

const SAMPLE_PHRASES = [
  "Hey, it's Jake! [laughs] Testing out the ElevenLabs v3 expressive model with my custom voice clone.",
  "Arc here. I'm using your personal voice clone on Eleven v3 Expressive to speak our responses.",
  "Look, we move fast. We build, test, and iterate instead of endlessly planning shit.",
  "One conversation at a time. No unsolicited advice, just real human storytelling without the bullshit.",
];

export function VoiceLabPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdminAccess();
  const { toast } = useToast();
  const isAdminBannerActive = useAdminBanner();

  const [isDesktopStandalone, setIsDesktopStandalone] = useState(false);
  useEffect(() => {
    setIsDesktopStandalone(shouldReserveDesktopTrafficLightSpace());
  }, []);

  // Authentication check: only Jake Freudinger's account or admin
  const isJake = Boolean(
    isAdmin ||
    user?.email === 'jakefreudinger@gmail.com' ||
    user?.email === 'jakefroydinger@gmail.com'
  );

  // Settings & Configuration
  const [apiKey, setApiKey] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_API_KEY) || '';
  });
  const [voiceId, setVoiceId] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_VOICE_ID) || DEFAULT_VOICE_ID;
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [modelId, setModelId] = useState<
    'eleven_v3' | 'eleven_v3_conversational' | 'eleven_turbo_v2_5' | 'eleven_flash_v2_5' | 'eleven_multilingual_v2'
  >(() => {
    return (
      (localStorage.getItem(STORAGE_KEY_MODEL_ID) as
        | 'eleven_v3'
        | 'eleven_v3_conversational'
        | 'eleven_turbo_v2_5'
        | 'eleven_flash_v2_5'
        | 'eleven_multilingual_v2') || 'eleven_v3'
    );
  });

  const handleSaveModelId = (newModelId: typeof modelId) => {
    setModelId(newModelId);
    localStorage.setItem(STORAGE_KEY_MODEL_ID, newModelId);
  };
  const [stability, setStability] = useState<number>(0.5);
  const [similarityBoost, setSimilarityBoost] = useState<number>(0.8);
  const [style, setStyle] = useState<number>(0.0);
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);
  const [personaPrompt, setPersonaPrompt] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_PERSONA_PROMPT) || JAKE_PERSONA_PROMPT;
  });

  const handleSavePersonaPrompt = (newPrompt: string) => {
    setPersonaPrompt(newPrompt);
    localStorage.setItem(STORAGE_KEY_PERSONA_PROMPT, newPrompt);
  };

  const handleResetPersonaPrompt = () => {
    setPersonaPrompt(JAKE_PERSONA_PROMPT);
    localStorage.setItem(STORAGE_KEY_PERSONA_PROMPT, JAKE_PERSONA_PROMPT);
    toast({
      title: 'Persona Context Reset',
      description: "Reset to Jake's core counterpart context.",
    });
  };

  // Testing & Chat State
  const [activeTab, setActiveTab] = useState<'chat' | 'preview'>('chat');
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [turnByTurnMode, setTurnByTurnMode] = useState(true);
  const [micVolume, setMicVolume] = useState(0);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [previewText, setPreviewText] = useState(SAMPLE_PHRASES[0]);
  const [lastAudioUrl, setLastAudioUrl] = useState<string | null>(null);

  // Audio Context & Visualizer (Playback)
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const [visualizerFrequencies, setVisualizerFrequencies] = useState<number[]>(new Array(16).fill(0));
  const animationFrameRef = useRef<number | null>(null);
  const currentAudioElementRef = useRef<HTMLAudioElement | null>(null);

  // MediaRecorder & Mic Capture Refs
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const micAudioContextRef = useRef<AudioContext | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micAnimFrameRef = useRef<number | null>(null);
  const turnByTurnRef = useRef<boolean>(true);
  const isTranscribingRef = useRef<boolean>(false);
  const startRecordingRef = useRef<() => Promise<void>>();
  const handleSendChatRef = useRef<(promptOverride?: string) => Promise<void>>();

  useEffect(() => {
    turnByTurnRef.current = turnByTurnMode;
  }, [turnByTurnMode]);

  // Save API Key & Voice ID to localStorage
  const handleSaveApiKey = (newKey: string) => {
    setApiKey(newKey);
    localStorage.setItem(STORAGE_KEY_API_KEY, newKey.trim());
    toast({
      title: 'API Key Saved',
      description: 'Your ElevenLabs key is securely saved to local storage on this device only.',
    });
  };

  const handleClearApiKey = () => {
    setApiKey('');
    localStorage.removeItem(STORAGE_KEY_API_KEY);
    toast({
      title: 'API Key Cleared',
      description: 'The ElevenLabs API key has been removed from this device.',
    });
  };

  const handleSaveVoiceId = (newVoiceId: string) => {
    setVoiceId(newVoiceId);
    localStorage.setItem(STORAGE_KEY_VOICE_ID, newVoiceId.trim());
  };

  const handleResetVoiceId = () => {
    setVoiceId(DEFAULT_VOICE_ID);
    localStorage.setItem(STORAGE_KEY_VOICE_ID, DEFAULT_VOICE_ID);
    toast({
      title: 'Voice ID Reset',
      description: `Reset to Jake's default voice ID (${DEFAULT_VOICE_ID})`,
    });
  };

  // ElevenLabs TTS synthesis function
  const synthesizeSpeech = async (text: string): Promise<Blob> => {
    const trimmedKey = apiKey.trim();
    if (!trimmedKey) {
      throw new Error('ElevenLabs API Key required. Please enter your key above.');
    }

    const trimmedVoiceId = voiceId.trim() || DEFAULT_VOICE_ID;
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${trimmedVoiceId}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': trimmedKey,
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability,
          similarity_boost: similarityBoost,
          style,
          use_speaker_boost: true,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMsg = `ElevenLabs API error (${response.status})`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson?.detail?.message) errorMsg = errorJson.detail.message;
        else if (errorJson?.message) errorMsg = errorJson.message;
      } catch {
        if (errorText) errorMsg += `: ${errorText.slice(0, 120)}`;
      }
      throw new Error(errorMsg);
    }

    return await response.blob();
  };

  // Audio Playback with Analyser
  const stopAudio = useCallback(() => {
    if (currentAudioElementRef.current) {
      currentAudioElementRef.current.pause();
      currentAudioElementRef.current = null;
    }
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop();
      } catch {
        // audio source may have already finished
      }
      audioSourceRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setIsPlayingAudio(false);
    setVisualizerFrequencies(new Array(16).fill(0));
  }, []);

  const playAudioBlob = useCallback(async (blob: Blob): Promise<void> => {
    stopAudio();

    const audioUrl = URL.createObjectURL(blob);
    setLastAudioUrl(audioUrl);

    try {
      const windowWithAudio = window as unknown as {
        AudioContext?: typeof AudioContext;
        webkitAudioContext?: typeof AudioContext;
      };
      const AudioCtx = windowWithAudio.AudioContext || windowWithAudio.webkitAudioContext;
      if (!AudioCtx) {
        throw new Error('Web Audio API not supported in this browser.');
      }

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioCtx();
      }
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      const audio = new Audio(audioUrl);
      currentAudioElementRef.current = audio;

      const sourceNode = audioContextRef.current.createMediaElementSource(audio);
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 64;
      sourceNode.connect(analyser);
      analyser.connect(audioContextRef.current.destination);
      analyserRef.current = analyser;

      const updateFrequencyData = () => {
        if (!analyserRef.current) return;
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);

        // Sample 16 frequencies
        const samples: number[] = [];
        const step = Math.max(1, Math.floor(dataArray.length / 16));
        for (let i = 0; i < 16; i++) {
          samples.push((dataArray[i * step] || 0) / 255);
        }
        setVisualizerFrequencies(samples);

        animationFrameRef.current = requestAnimationFrame(updateFrequencyData);
      };

      audio.onplay = () => {
        setIsPlayingAudio(true);
        updateFrequencyData();
      };

      audio.onended = () => {
        stopAudio();
        if (turnByTurnRef.current) {
          setTimeout(() => {
            void startRecordingRef.current?.();
          }, 450);
        }
      };

      audio.onerror = () => {
        stopAudio();
        toast({
          title: 'Playback error',
          description: 'Failed to play synthesized audio.',
          variant: 'destructive',
        });
      };

      await audio.play();
    } catch (err: unknown) {
      console.error('Audio playback error:', err);
      stopAudio();
      toast({
        title: 'Audio error',
        description: err instanceof Error ? err.message : 'Could not initialize audio player.',
        variant: 'destructive',
      });
    }
  }, [stopAudio, toast]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopAudio();
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, [stopAudio]);

  // Quick Speech Preview Handler
  const handlePreviewPhrase = async (phraseToSpeak?: string) => {
    const text = phraseToSpeak || previewText;
    if (!text.trim()) {
      toast({ title: 'Text required', description: 'Please enter text to speak.', variant: 'destructive' });
      return;
    }
    if (!apiKey.trim()) {
      toast({ title: 'API Key required', description: 'Please enter your ElevenLabs API key first.', variant: 'destructive' });
      return;
    }

    setIsGenerating(true);
    try {
      const blob = await synthesizeSpeech(text);
      await playAudioBlob(blob);
    } catch (err: unknown) {
      console.error('Synthesis failed:', err);
      toast({
        title: 'Synthesis failed',
        description: err instanceof Error ? err.message : 'Error communicating with ElevenLabs.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Conversational Assistant Logic (Powered by Arc AI with Jake's Counterpart Context)
  const generateAssistantResponse = async (userPrompt: string): Promise<string> => {
    try {
      if (supabase) {
        const { data, error } = await supabase.functions.invoke('chat', {
          body: {
            // Voice Lab doubles as a product help bot test bench, so it asks the
            // chat function to keep Arc's capability context alongside the
            // persona instead of replacing the system prompt outright.
            include_arc_knowledge: true,
            messages: [
              {
                role: 'system',
                content: `[ENHANCE_MODE] ${personaPrompt.trim()}\n\nYou built ArcAI and you know it inside out. You are the developer, not the assistant inside it. When someone asks how something works or how to do something in ArcAI, help them the way you would if they called you about it: in your own voice, concrete and direct. Talk about Arc in the third person, as your product. Never speak as Arc, never introduce yourself as Arc or as an AI assistant, and never say you are here to help "as Arc" or describe Arc's features as your own abilities. If you genuinely do not know something, say so rather than guessing.\n\nCRITICAL CONVERSATIONAL INSTRUCTION: You are speaking aloud over audio. Keep responses natural, conversational, punchy, and concise (1-3 short sentences unless more detail is directly asked for). Never use markdown headers, bullet points, asterisks, or formatting symbols that sound awkward when read aloud.`,
              },
              ...turns.slice(-6).map((t) => ({
                role: t.role,
                content: t.text,
              })),
              {
                role: 'user',
                content: `[ENHANCE_REQUEST_ONLY] ${userPrompt}`,
              },
            ],
          },
        });

        if (!error) {
          const content =
            data?.choices?.[0]?.message?.content ||
            data?.response ||
            data?.message ||
            data?.content;
          if (content && typeof content === 'string' && content.trim()) {
            return content.trim();
          }
        }
      }
    } catch (chatErr) {
      console.warn('Chat AI invoke fallback:', chatErr);
    }

    // Direct contextual fallback modeled after Jake Freudinger
    const lower = userPrompt.toLowerCase();
    if (lower.includes('hello') || lower.includes('hey') || lower.includes('hi') || lower.includes('sup')) {
      return `What's going on man. Custom voice is locked in and streaming. What are we building today?`;
    }
    if (lower.includes('how do you sound') || lower.includes('how does it sound')) {
      return `Honestly, sounds pretty damn accurate. Cadence feels right. What do you think?`;
    }
    if (lower.includes('win the night')) {
      return `One conversation at a time. No unsolicited advice, just real human storytelling without the bullshit.`;
    }
    return `Got it. Let's keep moving and test the next thing.`;
  };

  // Handle Send Chat Message
  const handleSendChat = useCallback(async (promptOverride?: string) => {
    const prompt = (promptOverride || inputText).trim();
    if (!prompt) return;
    if (!apiKey.trim()) {
      toast({
        title: 'API Key required',
        description: 'Please enter your ElevenLabs API key at the top of the page.',
        variant: 'destructive',
      });
      return;
    }

    setInputText('');
    const userTurn: ChatTurn = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: prompt,
      timestamp: new Date(),
    };

    setTurns((prev) => [...prev, userTurn]);
    setIsGenerating(true);

    try {
      const assistantText = await generateAssistantResponse(prompt);
      const audioBlob = await synthesizeSpeech(assistantText);
      const audioUrl = URL.createObjectURL(audioBlob);

      const assistantTurn: ChatTurn = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: assistantText,
        audioBlob,
        audioUrl,
        timestamp: new Date(),
      };

      setTurns((prev) => [...prev, assistantTurn]);
      await playAudioBlob(audioBlob);
    } catch (err: unknown) {
      console.error('Chat generation error:', err);
      toast({
        title: 'Error generating speech',
        description: err instanceof Error ? err.message : 'Failed to synthesize speech.',
        variant: 'destructive',
      });
      if (turnByTurnRef.current) {
        setTimeout(() => {
          void startRecordingRef.current?.();
        }, 1000);
      }
    } finally {
      setIsGenerating(false);
    }
  }, [apiKey, generateAssistantResponse, inputText, playAudioBlob, synthesizeSpeech, toast]);

  useEffect(() => {
    handleSendChatRef.current = handleSendChat;
  }, [handleSendChat]);

  // Stop recording and send audio to Whisper for transcription
  const stopRecordingAndSend = useCallback(async () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
      setIsRecording(false);
      return;
    }

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (micAnimFrameRef.current) {
      cancelAnimationFrame(micAnimFrameRef.current);
      micAnimFrameRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    const blobPromise = new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || 'audio/webm';
        resolve(new Blob(recordedChunksRef.current, { type: mimeType }));
      };
    });

    try {
      recorder.stop();
    } catch {
      // ignore
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    setIsRecording(false);
    setIsTranscribing(true);
    isTranscribingRef.current = true;

    try {
      const audioBlob = await blobPromise;
      if (audioBlob.size < 1200) {
        // Practically empty audio, restart listening if in turn-by-turn mode
        setIsTranscribing(false);
        isTranscribingRef.current = false;
        if (turnByTurnRef.current) {
          setTimeout(() => {
            void startRecordingRef.current?.();
          }, 400);
        }
        return;
      }

      const formData = new FormData();
      formData.append('file', audioBlob, 'turn.webm');

      const { data, error } = await supabase.functions.invoke('whisper-transcribe', {
        body: formData,
      });

      if (error) {
        throw new Error(error.message || 'Whisper transcription failed');
      }

      const transcript = (data?.text || '').trim();
      if (transcript) {
        await handleSendChatRef.current?.(transcript);
      } else {
        if (turnByTurnRef.current) {
          setTimeout(() => {
            void startRecordingRef.current?.();
          }, 500);
        }
      }
    } catch (err: unknown) {
      console.error('Transcription error:', err);
      toast({
        title: 'Transcription error',
        description: err instanceof Error ? err.message : 'Failed to transcribe audio.',
        variant: 'destructive',
      });
      if (turnByTurnRef.current) {
        setTimeout(() => {
          void startRecordingRef.current?.();
        }, 800);
      }
    } finally {
      setIsTranscribing(false);
      isTranscribingRef.current = false;
    }
  }, [toast]);

  // Start recording from mic
  const startRecording = useCallback(async () => {
    if (isPlayingAudio) {
      stopAudio();
    }
    if (isTranscribingRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      recordedChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(200);
      setIsRecording(true);

      const windowWithAudio = window as unknown as {
        AudioContext?: typeof AudioContext;
        webkitAudioContext?: typeof AudioContext;
      };
      const AudioCtx = windowWithAudio.AudioContext || windowWithAudio.webkitAudioContext;
      if (AudioCtx) {
        const audioCtx = new AudioCtx();
        micAudioContextRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        micAnalyserRef.current = analyser;

        let hasSpoken = false;
        let silenceStartTime: number | null = null;

        const checkVolume = () => {
          if (!micAnalyserRef.current) return;
          const dataArray = new Uint8Array(micAnalyserRef.current.frequencyBinCount);
          micAnalyserRef.current.getByteFrequencyData(dataArray);

          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length / 255;
          setMicVolume(avg);

          if (avg > 0.07) {
            hasSpoken = true;
            silenceStartTime = null;
          } else if (hasSpoken) {
            if (!silenceStartTime) {
              silenceStartTime = Date.now();
            } else if (Date.now() - silenceStartTime > 1600) {
              // 1.6s silence after speaking -> auto send turn!
              void stopRecordingAndSend();
              return;
            }
          }

          micAnimFrameRef.current = requestAnimationFrame(checkVolume);
        };
        checkVolume();
      }
    } catch (err: unknown) {
      console.error('Microphone access error:', err);
      toast({
        title: 'Microphone Access Denied',
        description: 'Please allow microphone access in your browser to talk.',
        variant: 'destructive',
      });
      setIsRecording(false);
    }
  }, [isPlayingAudio, stopAudio, stopRecordingAndSend, toast]);

  useEffect(() => {
    startRecordingRef.current = startRecording;
  }, [startRecording]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      void stopRecordingAndSend();
    } else {
      void startRecording();
    }
  }, [isRecording, startRecording, stopRecordingAndSend]);

  useEffect(() => {
    return () => {
      stopAudio();
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
      if (micAnimFrameRef.current) {
        cancelAnimationFrame(micAnimFrameRef.current);
      }
    };
  }, [stopAudio]);

  // Guard: if loading or not Jake, block access
  if (authLoading || adminLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Verifying access credentials...</p>
        </div>
      </div>
    );
  }

  if (!isJake) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background px-4">
        <Card className="glass-card max-w-md border-destructive/20 text-center">
          <CardHeader>
            <Shield className="mx-auto h-12 w-12 text-destructive mb-2" />
            <CardTitle className="text-xl">Access Restricted</CardTitle>
            <CardDescription>
              This Voice Lab is an exclusive internal testing sandbox restricted solely to Jake Freudinger's account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="outline" onClick={() => navigate('/')} className="w-full">
              Return to App
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div
      className="relative min-h-screen w-full bg-background text-foreground overflow-y-auto touch-pan-y"
      style={{
        paddingTop: `calc(env(safe-area-inset-top, 0px) + ${isAdminBannerActive ? 'var(--admin-banner-height, 0px)' : '0px'} + ${isDesktopStandalone ? 'var(--arcai-desktop-titlebar-safe-area, 30px)' : '0px'} + 0.75rem)`,
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 2rem)',
        paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))',
      }}
    >
      {/* Background ambient lighting */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-36 top-[-180px] h-[520px] w-[520px] rounded-full bg-primary/[0.08] blur-[140px]" />
        <div className="absolute -right-40 bottom-[-220px] h-[560px] w-[560px] rounded-full bg-purple-500/[0.07] blur-[150px]" />
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-white/[0.035] to-transparent" />
      </div>

      <div className="relative mx-auto flex min-h-full max-w-5xl flex-col pb-8">
        {/* Navigation & Header */}
        <header className="flex flex-col gap-3.5 border-b border-white/[0.08] pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={() => navigate('/dashboard/settings')}
              className="h-9 w-9 shrink-0 rounded-full border-white/[0.09] bg-white/[0.04] hover:bg-primary/10 hover:text-primary shadow-[0_0_18px_rgba(168,85,247,0.08)]"
              aria-label="Back to settings"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.055] shadow-[0_0_28px_rgba(168,85,247,0.16)]">
                <ThemedLogo className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-base sm:text-lg font-semibold tracking-[-0.02em] text-foreground">
                    Jake's Voice Lab
                  </h1>
                  <Badge variant="outline" className="border-primary/40 bg-primary/10 text-[10px] text-primary">
                    ElevenLabs v3
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground truncate">
                  Custom Voice <code className="font-mono text-foreground/80">{voiceId}</code>
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSettingsDrawer(!showSettingsDrawer)}
              className="h-8 gap-1.5 rounded-full border-white/10 bg-white/[0.03] text-xs"
            >
              <Sliders className="h-3.5 w-3.5 text-primary" />
              <span>Parameters</span>
            </Button>
            <Button
              variant={isPlayingAudio ? 'destructive' : 'outline'}
              size="sm"
              onClick={isPlayingAudio ? stopAudio : () => handlePreviewPhrase()}
              disabled={isGenerating || !apiKey.trim()}
              className="h-8 gap-1.5 rounded-full text-xs"
            >
              {isPlayingAudio ? (
                <>
                  <Pause className="h-3.5 w-3.5" /> Stop
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" /> Preview
                </>
              )}
            </Button>
          </div>
        </header>

        {/* API Key Banner & Status */}
        <section className="mt-5 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 shadow-sm backdrop-blur-md">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl border shrink-0 ${apiKey.trim() ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'}`}>
                <Key className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">ElevenLabs API Key</span>
                  <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${apiKey.trim() ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                  <span className="text-[10px] text-muted-foreground truncate">
                    {apiKey.trim() ? 'Stored locally in browser' : 'Key required'}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Saved only in your browser storage. Never sent to Arc servers or committed to Git.
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-72">
                <Input
                  type={showApiKey ? 'text' : 'password'}
                  placeholder="Paste ElevenLabs key (sk_...)"
                  value={apiKey}
                  onChange={(e) => handleSaveApiKey(e.target.value)}
                  className="h-9 text-[16px] sm:text-xs pr-8 font-mono bg-black/20 border-white/10"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                  aria-label={showApiKey ? 'Hide key' : 'Show key'}
                >
                  {showApiKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              {apiKey && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleClearApiKey}
                  className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                  title="Clear API Key"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        </section>

        {/* Voice Parameters Collapsible Drawer */}
        <AnimatePresence>
          {showSettingsDrawer && (
            <motion.section
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 overflow-hidden rounded-2xl border border-white/[0.08] bg-black/30 p-5 backdrop-blur-md"
            >
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {/* Voice ID Input */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-foreground">Voice ID</label>
                    <button
                      onClick={handleResetVoiceId}
                      className="text-[10px] text-primary hover:underline flex items-center gap-1"
                    >
                      <RotateCcw className="h-2.5 w-2.5" /> Reset to default
                    </button>
                  </div>
                  <Input
                    value={voiceId}
                    onChange={(e) => handleSaveVoiceId(e.target.value)}
                    placeholder="Enter Voice ID"
                    className="h-9 font-mono text-[16px] sm:text-xs bg-black/40 border-white/10"
                  />
                  <p className="text-[10px] text-muted-foreground">Default: Jake's Custom Voice ({DEFAULT_VOICE_ID})</p>
                </div>

                {/* Model Selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">ElevenLabs Model</label>
                  <select
                    value={modelId}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleSaveModelId(e.target.value as typeof modelId)}
                    className="h-9 w-full rounded-md border border-white/10 bg-black/40 px-2.5 text-[16px] sm:text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-medium"
                  >
                    <option value="eleven_v3">Eleven v3 Expressive (Default · Flagship & Emotional)</option>
                    <option value="eleven_v3_conversational">Eleven v3 Conversational (Low Latency / Dialogue)</option>
                    <option value="eleven_turbo_v2_5">Turbo v2.5 (Fast & High Quality)</option>
                    <option value="eleven_flash_v2_5">Flash v2.5 (Ultra Low Latency)</option>
                    <option value="eleven_multilingual_v2">Multilingual v2 (Legacy)</option>
                  </select>
                  <p className="text-[10px] text-muted-foreground">v3 Expressive supports emotional audio tags like [laughs] and [sighs].</p>
                </div>

                {/* Stability Slider */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-foreground">Stability</label>
                    <span className="font-mono text-[11px] text-muted-foreground">{stability.toFixed(2)}</span>
                  </div>
                  <Slider
                    value={[Math.round(stability * 100)]}
                    min={0}
                    max={100}
                    step={5}
                    onValueChange={(val) => setStability(val[0] / 100)}
                    className="py-1"
                  />
                  <div className="flex justify-between text-[9px] text-muted-foreground">
                    <span>More variable / emotional</span>
                    <span>More stable / consistent</span>
                  </div>
                </div>

                {/* Similarity Boost */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-foreground">Similarity Boost</label>
                    <span className="font-mono text-[11px] text-muted-foreground">{similarityBoost.toFixed(2)}</span>
                  </div>
                  <Slider
                    value={[Math.round(similarityBoost * 100)]}
                    min={0}
                    max={100}
                    step={5}
                    onValueChange={(val) => setSimilarityBoost(val[0] / 100)}
                    className="py-1"
                  />
                  <div className="flex justify-between text-[9px] text-muted-foreground">
                    <span>Low clarity</span>
                    <span>High fidelity</span>
                  </div>
                </div>

                {/* Style Exaggeration */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-foreground">Style Exaggeration</label>
                    <span className="font-mono text-[11px] text-muted-foreground">{style.toFixed(2)}</span>
                  </div>
                  <Slider
                    value={[Math.round(style * 100)]}
                    min={0}
                    max={100}
                    step={5}
                    onValueChange={(val) => setStyle(val[0] / 100)}
                    className="py-1"
                  />
                  <div className="flex justify-between text-[9px] text-muted-foreground">
                    <span>Neutral</span>
                    <span>Exaggerated</span>
                  </div>
                </div>

                {/* Jake's Counterpart Persona Prompt */}
                <div className="sm:col-span-2 lg:col-span-3 space-y-2 pt-3 border-t border-white/[0.08]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      <label className="text-xs font-medium text-foreground">AI Counterpart Context (Jake Freudinger Model)</label>
                    </div>
                    <button
                      onClick={handleResetPersonaPrompt}
                      className="text-[10px] text-primary hover:underline flex items-center gap-1"
                    >
                      <RotateCcw className="h-2.5 w-2.5" /> Reset Context
                    </button>
                  </div>
                  <Textarea
                    value={personaPrompt}
                    onChange={(e) => handleSavePersonaPrompt(e.target.value)}
                    placeholder="Enter persona system context..."
                    className="min-h-[140px] text-[16px] sm:text-xs bg-black/40 border-white/10 font-mono leading-relaxed resize-y p-3"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Active context: Chicagoland creator, Win The Night co-founder, conversational, direct, fast builder, no em dashes, human storytelling.
                  </p>
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Audio Visualizer Orb & Frequency Bars */}
        <section className="mt-4 sm:mt-5 flex flex-col items-center justify-center rounded-3xl border border-white/[0.08] bg-white/[0.02] p-5 sm:p-8 shadow-inner backdrop-blur-md">
          <div className="relative flex items-center justify-center">
            {/* Pulsing ambient halo */}
            <motion.div
              animate={{
                scale: isPlayingAudio ? [1, 1.25, 1] : isRecording ? [1, 1.15, 1] : 1,
                opacity: isPlayingAudio ? [0.3, 0.7, 0.3] : isRecording ? [0.2, 0.6, 0.2] : 0.1,
              }}
              transition={{ repeat: Infinity, duration: isPlayingAudio ? 1.4 : isRecording ? 1.2 : 2 }}
              className={`absolute h-28 w-28 sm:h-36 sm:w-36 rounded-full blur-2xl ${
                isRecording
                  ? 'bg-gradient-to-tr from-rose-600/50 to-red-500/50'
                  : isTranscribing
                  ? 'bg-gradient-to-tr from-cyan-500/40 to-blue-500/40'
                  : 'bg-gradient-to-tr from-purple-600/40 to-primary/40'
              }`}
            />

            {/* Center Orb */}
            <div className={`relative z-10 flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full border shadow-2xl transition-all duration-300 ${
              isPlayingAudio
                ? 'border-primary/80 bg-primary/20 shadow-[0_0_40px_rgba(168,85,247,0.5)]'
                : isRecording
                ? 'border-rose-500/80 bg-rose-500/20 shadow-[0_0_40px_rgba(244,63,94,0.5)] animate-pulse'
                : isTranscribing
                ? 'border-cyan-400/80 bg-cyan-400/20 shadow-[0_0_40px_rgba(34,211,238,0.4)]'
                : isGenerating
                ? 'border-amber-400/80 bg-amber-400/20 animate-spin'
                : 'border-white/10 bg-white/[0.04]'
            }`}>
              {isGenerating ? (
                <RefreshCw className="h-5 w-5 sm:h-6 sm:w-6 text-amber-300 animate-spin" />
              ) : isTranscribing ? (
                <Loader2 className="h-5 w-5 sm:h-6 sm:w-6 text-cyan-300 animate-spin" />
              ) : isPlayingAudio ? (
                <Volume2 className="h-6 w-6 sm:h-7 sm:w-7 text-primary animate-pulse" />
              ) : isRecording ? (
                <Mic className="h-6 w-6 sm:h-7 sm:w-7 text-rose-400" />
              ) : (
                <Radio className="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground/60" />
              )}
            </div>
          </div>

          {/* Status Label */}
          <div className="mt-3 sm:mt-4 text-center">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {isGenerating
                ? 'Synthesizing speech via ElevenLabs...'
                : isTranscribing
                ? 'Transcribing speech with Whisper...'
                : isPlayingAudio
                ? "Playing Jake's Custom Voice"
                : isRecording
                ? 'Listening to microphone... (Speak naturally)'
                : 'Ready for voice test'}
            </p>
          </div>

          {/* Dynamic Frequency Bars */}
          <div className="mt-4 flex items-end gap-1.5 h-10 px-6">
            {visualizerFrequencies.map((freq, idx) => (
              <motion.div
                key={idx}
                className={`w-1.5 rounded-full ${isRecording ? 'bg-rose-500/70' : 'bg-primary/70'}`}
                animate={{
                  height: isPlayingAudio
                    ? `${Math.max(4, freq * 40)}px`
                    : isRecording
                    ? `${Math.max(4, Math.min(36, micVolume * 80 * (1 + (idx % 4) * 0.3)))}px`
                    : '4px',
                  opacity: isPlayingAudio ? Math.max(0.4, freq) : isRecording ? Math.max(0.3, micVolume * 2) : 0.25,
                }}
                transition={{ duration: 0.08 }}
              />
            ))}
          </div>
        </section>

        {/* Tab Controls: Interactive Chat vs Script Previewer */}
        <div className="mt-6 flex border-b border-white/[0.08]">
          <button
            onClick={() => setActiveTab('chat')}
            className={`pb-3 text-xs font-medium transition-colors border-b-2 px-4 ${
              activeTab === 'chat'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Voice Chat Simulation
          </button>
          <button
            onClick={() => setActiveTab('preview')}
            className={`pb-3 text-xs font-medium transition-colors border-b-2 px-4 ${
              activeTab === 'preview'
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Script & Phrase Previewer
          </button>
        </div>

        {/* Tab Content: Chat Simulation */}
        {activeTab === 'chat' && (
          <div className="mt-4 flex flex-1 flex-col gap-4">
            {/* Conversation turns container */}
            <div className="flex-1 min-h-[260px] max-h-[420px] overflow-y-auto space-y-3 rounded-2xl border border-white/[0.06] bg-black/20 p-4">
              {turns.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center p-8 text-muted-foreground">
                  <Radio className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-xs font-medium">No conversation turns yet</p>
                  <p className="text-[11px] max-w-sm mt-1">
                    Tap the mic below or type a message. Arc will answer using your custom ElevenLabs voice clone.
                  </p>
                </div>
              ) : (
                turns.map((turn) => (
                  <motion.div
                    key={turn.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex flex-col ${turn.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div className="flex items-center gap-1.5 mb-1 px-1">
                      <span className="text-[10px] font-medium text-muted-foreground">
                        {turn.role === 'user' ? 'Jake' : "Arc (Jake's Voice)"}
                      </span>
                      <span className="text-[9px] text-muted-foreground/60">
                        {turn.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed shadow-sm ${
                        turn.role === 'user'
                          ? 'bg-primary/20 text-foreground border border-primary/30 rounded-tr-sm'
                          : 'bg-white/[0.04] text-foreground border border-white/[0.08] rounded-tl-sm'
                      }`}
                    >
                      {turn.text}

                      {turn.role === 'assistant' && turn.audioBlob && (
                        <div className="mt-2.5 flex items-center gap-2 pt-2 border-t border-white/[0.06]">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => playAudioBlob(turn.audioBlob!)}
                            className="h-6 gap-1 px-2 text-[10px] text-primary hover:text-primary"
                          >
                            <Play className="h-3 w-3" /> Replay Voice
                          </Button>
                          {turn.audioUrl && (
                            <a
                              href={turn.audioUrl}
                              download={`jake-voice-${turn.id}.mp3`}
                              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                            >
                              <Download className="h-3 w-3" /> Download MP3
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))
              )}
            </div>

            {/* Input Bar & Turn-by-Turn mode toggle */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between px-1 text-[11px] text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Hands-free Auto Turn Loop</span>
                  <button
                    type="button"
                    onClick={() => setTurnByTurnMode(!turnByTurnMode)}
                    className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      turnByTurnMode ? 'bg-primary' : 'bg-white/10'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        turnByTurnMode ? 'translate-x-3' : 'translate-x-0'
                      }`}
                    />
                  </button>
                  <span className="text-[10px] text-muted-foreground/70 hidden sm:inline">
                    {turnByTurnMode ? '(Mic automatically listens after Arc speaks)' : '(Manual tap-to-talk)'}
                  </span>
                </div>
                {isRecording && (
                  <span className="text-[10px] text-rose-400 animate-pulse font-medium">
                    Recording live...
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant={isRecording ? 'destructive' : 'outline'}
                  size="icon"
                  onClick={toggleRecording}
                  disabled={isTranscribing || isGenerating}
                  className={`h-11 w-11 shrink-0 rounded-full border-white/10 ${
                    isRecording ? 'animate-pulse bg-rose-600 hover:bg-rose-700 text-white' : 'bg-white/[0.03]'
                  }`}
                  title={isRecording ? 'Stop speaking and send turn' : 'Speak via microphone (Whisper)'}
                >
                  {isTranscribing ? (
                    <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />
                  ) : isRecording ? (
                    <Square className="h-4 w-4 fill-white" />
                  ) : (
                    <Mic className="h-5 w-5" />
                  )}
                </Button>

                <Input
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendChat();
                    }
                  }}
                  placeholder={
                    isRecording
                      ? 'Listening... speak naturally, or tap stop'
                      : isTranscribing
                      ? 'Transcribing audio with Whisper...'
                      : 'Type a test prompt or question for Arc...'
                  }
                  disabled={isGenerating || isTranscribing}
                  className="h-11 rounded-full bg-white/[0.04] border-white/10 text-[16px] sm:text-xs px-4"
                />

                <Button
                  type="button"
                  onClick={() => handleSendChat()}
                  disabled={isGenerating || isTranscribing || !inputText.trim() || !apiKey.trim()}
                  className="h-11 w-11 shrink-0 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Tab Content: Script & Phrase Previewer */}
        {activeTab === 'preview' && (
          <div className="mt-4 flex flex-1 flex-col gap-5">
            {/* Quick sample buttons */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Preset Test Phrases:</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {SAMPLE_PHRASES.map((phrase, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setPreviewText(phrase);
                      handlePreviewPhrase(phrase);
                    }}
                    disabled={isGenerating || !apiKey.trim()}
                    className="flex items-start gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-left transition-all hover:bg-white/[0.05] hover:border-primary/40 disabled:opacity-50"
                  >
                    <Play className="h-3.5 w-3.5 shrink-0 text-primary mt-0.5" />
                    <span className="text-xs leading-snug text-foreground/90">{phrase}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom script text area */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">Custom Script / Text</label>
              <Textarea
                value={previewText}
                onChange={(e) => setPreviewText(e.target.value)}
                placeholder="Type or paste any text you want to synthesize in your voice..."
                className="min-h-[120px] rounded-xl bg-black/20 border-white/10 text-[16px] sm:text-xs p-3 leading-relaxed resize-y"
              />
              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] text-muted-foreground">
                  {previewText.length} characters · ~{Math.round(previewText.split(/\s+/).filter(Boolean).length)} words
                </span>
                <div className="flex items-center gap-2">
                  {lastAudioUrl && (
                    <a
                      href={lastAudioUrl}
                      download="jake-voice-preview.mp3"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mr-2"
                    >
                      <Download className="h-3.5 w-3.5" /> Download Audio
                    </a>
                  )}
                  <Button
                    size="sm"
                    onClick={() => handlePreviewPhrase()}
                    disabled={isGenerating || !previewText.trim() || !apiKey.trim()}
                    className="h-8 gap-1.5 text-xs rounded-full"
                  >
                    {isGenerating ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Synthesizing...
                      </>
                    ) : (
                      <>
                        <Volume2 className="h-3.5 w-3.5" /> Synthesize & Play
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
export default VoiceLabPage;
