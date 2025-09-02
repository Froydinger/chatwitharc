import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Wrench } from 'lucide-react';
import { GlassCard } from '@/components/ui/glass-card';
import { GlassButton } from '@/components/ui/glass-button';
import { useToast } from '@/hooks/use-toast';
import { useArcStore } from '@/store/useArcStore';

export const VoiceInterface: React.FC = () => {
  const { toast } = useToast();
  const { setCurrentTab } = useArcStore();
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);

  useEffect(() => {
    // Initialize speech recognition
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognitionInstance = new SpeechRecognition();
      
      recognitionInstance.continuous = true;
      recognitionInstance.interimResults = true;
      recognitionInstance.lang = 'en-US';
      
      recognitionInstance.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        
        if (finalTranscript) {
          console.log('Speech recognized:', finalTranscript);
          // Here you would send the transcript to your chat
          toast({
            title: "Speech Recognized",
            description: finalTranscript,
          });
        }
      };
      
      recognitionInstance.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        toast({
          title: "Speech Recognition Error",
          description: event.error,
          variant: "destructive",
        });
      };
      
      recognitionInstance.onend = () => {
        setIsListening(false);
      };
      
      setRecognition(recognitionInstance);
    }
  }, [toast]);

  const toggleListening = () => {
    if (!recognition) {
      toast({
        title: "Not Supported",
        description: "Speech recognition is not supported in this browser",
        variant: "destructive",
      });
      return;
    }

    if (isListening) {
      recognition.stop();
      setIsListening(false);
    } else {
      recognition.start();
      setIsListening(true);
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
              isListening 
                ? 'bg-primary/30 animate-pulse' 
                : 'bg-glass/30'
            }`}>
              {isListening ? (
                <MicOff className="h-12 w-12 text-primary-glow" />
              ) : (
                <Mic className="h-12 w-12 text-primary-glow" />
              )}
            </div>
            
            <div>
              <h3 className="text-xl font-semibold text-foreground mb-2">
                {isListening ? 'Listening...' : 'Ready to Listen'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {isListening 
                  ? 'Speak now and your words will be transcribed'
                  : 'Click the microphone to start voice input'
                }
              </p>
            </div>
            
            <GlassButton
              variant={isListening ? "ghost" : "glow"}
              size="lg"
              onClick={toggleListening}
              className={`w-full ${isListening ? 'text-destructive' : ''}`}
            >
              {isListening ? (
                <>
                  <MicOff className="h-4 w-4 mr-2" />
                  Stop Listening
                </>
              ) : (
                <>
                  <Mic className="h-4 w-4 mr-2" />
                  Start Listening
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
            <h4 className="text-lg font-semibold text-foreground">How it works</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• Click "Start Listening" to activate voice recognition</li>
              <li>• Speak clearly and wait for the transcription</li>
              <li>• Your speech will be converted to text and sent to ArcAI</li>
              <li>• Click "Stop Listening" when you're done speaking</li>
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