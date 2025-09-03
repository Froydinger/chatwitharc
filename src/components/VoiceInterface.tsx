import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Wrench } from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { useToast } from '@/hooks/use-toast';
import { useArcStore } from '@/store/useArcStore';
import { supabase } from '@/integrations/supabase/client';

// Audio encoding helper
const encodeAudioForAPI = (float32Array: Float32Array): string => {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  const uint8Array = new Uint8Array(int16Array.buffer);
  let binary = '';
  const chunkSize = 0x8000;
  
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  
  return btoa(binary);
};

// Audio decoding helper
const decodeAudioFromAPI = (base64Audio: string): Uint8Array => {
  const binaryString = atob(base64Audio);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

// WAV header creation
const createWavFromPCM = (pcmData: Uint8Array): ArrayBuffer => {
  const int16Data = new Int16Array(pcmData.length / 2);
  for (let i = 0; i < pcmData.length; i += 2) {
    int16Data[i / 2] = (pcmData[i + 1] << 8) | pcmData[i];
  }
  
  const wavHeader = new ArrayBuffer(44);
  const view = new DataView(wavHeader);
  
  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  const sampleRate = 24000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + int16Data.byteLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, 'data');
  view.setUint32(40, int16Data.byteLength, true);

  const wavArray = new ArrayBuffer(wavHeader.byteLength + int16Data.byteLength);
  const wavView = new Uint8Array(wavArray);
  wavView.set(new Uint8Array(wavHeader), 0);
  wavView.set(new Uint8Array(int16Data.buffer), wavHeader.byteLength);
  
  return wavArray;
};

// Audio queue for sequential playback
class AudioQueue {
  private queue: Uint8Array[] = [];
  private isPlaying = false;
  private audioContext: AudioContext;

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;
  }

  async addToQueue(audioData: Uint8Array) {
    this.queue.push(audioData);
    if (!this.isPlaying) {
      await this.playNext();
    }
  }

  private async playNext() {
    if (this.queue.length === 0) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;
    const audioData = this.queue.shift()!;

    try {
      const wavData = createWavFromPCM(audioData);
      const audioBuffer = await this.audioContext.decodeAudioData(wavData);
      
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);
      
      source.onended = () => this.playNext();
      source.start(0);
    } catch (error) {
      console.error('Error playing audio:', error);
      this.playNext();
    }
  }
}

export const VoiceInterface: React.FC = () => {
  const { toast } = useToast();
  const { setCurrentTab } = useArcStore();
  const [isConnected, setIsConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<AudioQueue | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const initializeAudio = async () => {
    try {
      audioContextRef.current = new AudioContext({ sampleRate: 24000 });
      audioQueueRef.current = new AudioQueue(audioContextRef.current);
      console.log('Audio system initialized');
    } catch (error) {
      console.error('Error initializing audio:', error);
      toast({
        title: "Audio Error",
        description: "Failed to initialize audio system",
        variant: "destructive",
      });
    }
  };

  const startRecording = async () => {
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      if (!audioContextRef.current) {
        await initializeAudio();
      }

      if (audioContextRef.current && streamRef.current) {
        sourceRef.current = audioContextRef.current.createMediaStreamSource(streamRef.current);
        processorRef.current = audioContextRef.current.createScriptProcessor(4096, 1, 1);
        
        processorRef.current.onaudioprocess = (e) => {
          const inputData = e.inputBuffer.getChannelData(0);
          const encodedAudio = encodeAudioForAPI(new Float32Array(inputData));
          
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type: 'input_audio_buffer.append',
              audio: encodedAudio
            }));
          }
        };
        
        sourceRef.current.connect(processorRef.current);
        processorRef.current.connect(audioContextRef.current.destination);
        setIsListening(true);
        console.log('Recording started');
      }
    } catch (error) {
      console.error('Error starting recording:', error);
      toast({
        title: "Microphone Error",
        description: "Failed to access microphone",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsListening(false);
    console.log('Recording stopped');
  };

  const connectToRealtime = async () => {
    try {
      console.log('Creating realtime session...');
      
      const { data, error } = await supabase.functions.invoke('realtime-session', {
        body: { 
          instructions: `You are ArcAI, a helpful assistant.` 
        }
      });

      if (error) {
        throw new Error(`Failed to create session: ${error.message}`);
      }

      if (!data?.client_secret?.value) {
        throw new Error('No client secret received');
      }

      const clientSecret = data.client_secret.value;
      console.log('Got client secret, connecting to realtime...');

      const wsUrl = `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01`;
      wsRef.current = new WebSocket(wsUrl, [
        'realtime',
        `openai-insecure-auth-${clientSecret}`
      ]);

      wsRef.current.onopen = () => {
        console.log('Realtime connection opened');
        setIsConnected(true);
        
        // Send session configuration
        wsRef.current?.send(JSON.stringify({
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            instructions: `You are ArcAI, a helpful assistant.`,
            voice: 'alloy',
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: {
              model: 'whisper-1'
            },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 1000
            },
            temperature: 0.8,
            max_response_output_tokens: 'inf'
          }
        }));
      };

      wsRef.current.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('Received realtime message:', message.type);
          
          switch (message.type) {
            case 'session.created':
              console.log('Session created');
              await initializeAudio();
              await startRecording();
              break;
              
            case 'response.audio.delta':
              if (message.delta && audioQueueRef.current) {
                const audioData = decodeAudioFromAPI(message.delta);
                await audioQueueRef.current.addToQueue(audioData);
                setIsSpeaking(true);
              }
              break;
              
            case 'response.audio.done':
              console.log('Audio response completed');
              setIsSpeaking(false);
              break;
              
            case 'response.error':
              console.error('Realtime response error:', message);
              toast({
                title: "AI Error",
                description: message.error?.message || 'Unknown error',
                variant: "destructive",
              });
              break;
              
            default:
              console.log('Unhandled message type:', message.type);
          }
        } catch (err) {
          console.error('Error parsing realtime message:', err);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        toast({
          title: "Connection Error",
          description: "Failed to connect to realtime service",
          variant: "destructive",
        });
      };

      wsRef.current.onclose = () => {
        console.log('Realtime connection closed');
        setIsConnected(false);
        stopRecording();
      };

    } catch (error) {
      console.error('Failed to connect to realtime:', error);
      toast({
        title: "Connection Failed",
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: "destructive",
      });
    }
  };

  const disconnect = () => {
    stopRecording();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setIsConnected(false);
    setIsSpeaking(false);
  };

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  const toggleConnection = () => {
    if (isConnected) {
      disconnect();
    } else {
      connectToRealtime();
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-8 pb-20 pt-16 px-4 h-full overflow-y-auto">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-3">
          <div className="glass rounded-full p-3">
            <Mic className="h-8 w-8 text-primary-glow" />
          </div>
          <h2 className="text-3xl font-bold text-foreground">Voice Interface</h2>
        </div>
        <p className="text-muted-foreground text-base">
          Use your voice to interact with ArcAI
        </p>
      </div>

      {/* Voice Controls */}
      <div className="max-w-md mx-auto">
        <GlassCard variant="bubble" glow className="p-8 text-center">
          <div className="space-y-6">
            <div className={`w-24 h-24 mx-auto rounded-full flex items-center justify-center transition-all duration-300 ${
              isConnected && isListening
                ? 'bg-primary/30 animate-pulse' 
                : isSpeaking
                ? 'bg-accent/30 animate-pulse'
                : 'bg-glass/30'
            }`}>
              {isConnected ? (
                isListening ? (
                  <Mic className="h-12 w-12 text-primary-glow animate-pulse" />
                ) : isSpeaking ? (
                  <Mic className="h-12 w-12 text-accent animate-pulse" />
                ) : (
                  <Mic className="h-12 w-12 text-primary-glow" />
                )
              ) : (
                <MicOff className="h-12 w-12 text-muted-foreground" />
              )}
            </div>
            
            <div>
              <h3 className="text-xl font-semibold text-foreground mb-2">
                {!isConnected ? 'Disconnected' : 
                 isListening ? 'Listening...' : 
                 isSpeaking ? 'AI Speaking...' : 'Connected'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {!isConnected 
                  ? 'Connect to start voice conversation'
                  : isListening 
                  ? 'Speak naturally for voice-to-voice conversation'
                  : isSpeaking
                  ? 'AI is responding with voice'
                  : 'Ready for voice conversation'
                }
              </p>
            </div>
            
            <GlassButton
              variant={isConnected ? "ghost" : "glow"}
              size="lg"
              onClick={toggleConnection}
              className={`w-full ${isConnected ? 'text-destructive' : ''}`}
              disabled={isConnected && (isListening || isSpeaking)}
            >
              {isConnected ? (
                <>
                  <MicOff className="h-4 w-4 mr-2" />
                  Disconnect
                </>
              ) : (
                <>
                  <Mic className="h-4 w-4 mr-2" />
                  Start Voice Chat
                </>
              )}
            </GlassButton>
          </div>
        </GlassCard>
      </div>

      {/* Info Card */}
      <div className="max-w-2xl mx-auto">
        <GlassCard variant="bubble" className="p-6">
          <div className="space-y-4">
            <h4 className="text-lg font-semibold text-foreground">Voice-to-Voice Chat</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• Click "Start Voice Chat" to connect to realtime AI</li>
              <li>• Speak naturally - the AI will detect when you finish</li>
              <li>• The AI responds with voice automatically</li>
              <li>• Have a natural conversation without button presses</li>
              <li>• Click "Disconnect" to end the voice session</li>
            </ul>
          </div>
        </GlassCard>
      </div>

      {/* Quick Action */}
      <div className="text-center">
        <GlassButton
          variant="ghost"
          onClick={() => setCurrentTab('chat')}
        >
          <Wrench className="h-4 w-4 mr-2" />
          Back to Chat
        </GlassButton>
      </div>
    </div>
  );
};

export default VoiceInterface;