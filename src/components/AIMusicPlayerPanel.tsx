import { useState } from "react";
import { Sparkles, Play, Pause, Download, Loader2, Music2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GlassCard } from "@/components/ui/glass-card";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface GeneratedTrack {
  id: string;
  title: string;
  audio_url: string;
  image_url?: string;
  tags?: string;
  duration?: number;
}

interface AIMusicPlayerPanelProps {
  audioRef: React.RefObject<HTMLAudioElement>;
  isPlaying: boolean;
  setIsPlaying: (value: boolean) => void;
}

export function AIMusicPlayerPanel({ audioRef, isPlaying, setIsPlaying }: AIMusicPlayerPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedTracks, setGeneratedTracks] = useState<GeneratedTrack[]>([]);
  const [currentAITrack, setCurrentAITrack] = useState<string | null>(null);
  const [duration, setDuration] = useState(8);
  const { toast } = useToast();

  // Poll for Replicate prediction completion
  const pollForCompletion = async (predictionId: string, replicateToken: string) => {
    const maxAttempts = 60; // 60 attempts = ~2 minutes
    const pollInterval = 2000; // 2 seconds

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));

      try {
        const statusResponse = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
          headers: {
            'Authorization': `Bearer ${replicateToken}`,
          },
        });

        if (statusResponse.ok) {
          const prediction = await statusResponse.json();
          console.log(`Poll attempt ${attempt + 1}/${maxAttempts}:`, prediction.status);

          if (prediction.status === 'succeeded') {
            console.log('Generation succeeded:', prediction.output);
            return prediction.output; // Returns audio URL
          }

          if (prediction.status === 'failed' || prediction.status === 'canceled') {
            throw new Error(prediction.error || 'Music generation failed');
          }
        }
      } catch (pollError) {
        console.error('Polling error:', pollError);
        throw pollError;
      }
    }

    throw new Error('Music generation timed out after 2 minutes.');
  };

  const generateMusic = async () => {
    if (!prompt.trim()) {
      toast({
        title: "Prompt required",
        description: "Please enter a description for the music you want to generate.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);

    try {
      // Replicate API Token - get your own at replicate.com
      const replicateToken = "r8_6YQ9bMZvT0X2dKfNpL1HjWcG3VxEsA4yRuB7i"; // Replace with actual token

      console.log('Generating music with Replicate MusicGen...');

      // Create prediction
      const response = await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${replicateToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          version: 'b05b1dff1d8c6dc63d14b0cdb42135378dcb87f6373b0d3d341ede46e59e2b38',
          input: {
            prompt: prompt.trim(),
            model_version: 'stereo-large',
            duration: duration,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Replicate API error:', response.status, errorData);
        throw new Error(`Failed to create prediction: ${errorData}`);
      }

      const prediction = await response.json();
      console.log('Prediction created:', prediction);

      toast({
        title: "Generating music...",
        description: `This will take about ${duration * 2} seconds. Please wait.`,
      });

      // Poll for completion
      const audioUrl = await pollForCompletion(prediction.id, replicateToken);

      if (!audioUrl) {
        throw new Error('No audio URL returned from generation');
      }

      const newTrack: GeneratedTrack = {
        id: prediction.id,
        title: prompt.substring(0, 30),
        audio_url: audioUrl,
        tags: prompt,
        duration: duration,
      };

      setGeneratedTracks([newTrack, ...generatedTracks]);

      toast({
        title: "Music generated!",
        description: "Your track is ready. Click to play.",
      });

      // Auto-play
      playAITrack(newTrack);

    } catch (error: any) {
      console.error('Error generating music:', error);
      toast({
        title: "Generation failed",
        description: error.message || "Failed to generate music. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const playAITrack = (track: GeneratedTrack) => {
    if (!audioRef.current) return;

    if (currentAITrack === track.id && isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }

    audioRef.current.src = track.audio_url;
    audioRef.current.loop = false; // AI tracks don't loop by default
    audioRef.current.play()
      .then(() => {
        setIsPlaying(true);
        setCurrentAITrack(track.id);
      })
      .catch((error) => {
        console.error('Error playing track:', error);
        toast({
          title: "Playback error",
          description: "Failed to play the track. The audio URL might be invalid.",
          variant: "destructive",
        });
      });
  };

  const downloadTrack = (track: GeneratedTrack) => {
    const link = document.createElement('a');
    link.href = track.audio_url;
    link.download = `${track.title}.mp3`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Downloading",
      description: `Downloading ${track.title}...`,
    });
  };

  return (
    <div className="space-y-4 pt-4 border-t border-border/30">
      {/* Header */}
      <div className="text-center space-y-2 px-4">
        <div className="flex items-center justify-center gap-2">
          <div className="glass rounded-full p-2">
            <Sparkles className="h-5 w-5 text-primary-glow" />
          </div>
          <h2 className="text-xl font-bold text-foreground">AI Music Generator</h2>
        </div>
        <p className="text-sm text-muted-foreground">Create custom music with AI</p>

        {/* Temporary Notice */}
        <div className="glass rounded-lg p-3 border border-green-500/20 bg-green-500/5">
          <p className="text-xs text-green-600 dark:text-green-400">
            ✨ Powered by <strong>Replicate MusicGen</strong> - Meta's AI music model
          </p>
        </div>
      </div>

      {/* Generation Controls */}
      <GlassCard variant="bubble" className="p-4 mx-4">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="music-prompt" className="text-sm font-medium">
              Describe your music
            </Label>
            <Input
              id="music-prompt"
              type="text"
              placeholder="e.g., calm ambient background music, upbeat electronic..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isGenerating) {
                  generateMusic();
                }
              }}
              className="glass border-glass-border"
              disabled={isGenerating}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="duration" className="text-sm font-medium">
                Duration
              </Label>
              <span className="text-xs text-muted-foreground">{duration} seconds</span>
            </div>
            <input
              id="duration"
              type="range"
              min="5"
              max="30"
              step="1"
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value))}
              disabled={isGenerating}
              className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer"
            />
          </div>

          <Button
            onClick={generateMusic}
            disabled={isGenerating || !prompt.trim()}
            className="w-full"
            size="lg"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate Music
              </>
            )}
          </Button>
        </div>
      </GlassCard>

      {/* Generated Tracks */}
      {generatedTracks.length > 0 && (
        <div className="space-y-3 px-4">
          <h3 className="text-sm font-semibold text-foreground">Generated Tracks</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-hide">
            {generatedTracks.map((track) => (
              <GlassCard
                key={track.id}
                variant="bubble"
                className={`p-3 cursor-pointer transition-all ${
                  currentAITrack === track.id && isPlaying
                    ? 'ring-1 ring-primary-glow bg-primary/10'
                    : 'hover:bg-muted/5'
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Album Art or Icon */}
                  <div className="w-12 h-12 rounded-lg overflow-hidden bg-gradient-to-br from-primary/20 to-primary-glow/20 flex-shrink-0">
                    {track.image_url ? (
                      <img
                        src={track.image_url}
                        alt={track.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Music2 className="h-5 w-5 text-primary-glow" />
                      </div>
                    )}
                  </div>

                  {/* Track Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate text-sm">
                      {track.title}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {track.tags || 'AI Generated'}
                    </p>
                  </div>

                  {/* Controls */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full"
                      onClick={() => playAITrack(track)}
                    >
                      {currentAITrack === track.id && isPlaying ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full"
                      onClick={() => downloadTrack(track)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {generatedTracks.length === 0 && !isGenerating && (
        <div className="text-center py-8 px-4">
          <div className="glass rounded-full p-4 w-16 h-16 mx-auto mb-3 flex items-center justify-center">
            <Music2 className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            No tracks generated yet. Enter a prompt above to create your first AI music!
          </p>
        </div>
      )}
    </div>
  );
}
