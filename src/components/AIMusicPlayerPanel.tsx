import { useState } from "react";
import { Sparkles, Play, Pause, Download, Loader2, Music2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GlassCard } from "@/components/ui/glass-card";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

interface GeneratedTrack {
  id: string;
  title: string;
  audioUrl: string;
  imageUrl?: string;
  tags?: string[];
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
  const [selectedStyle, setSelectedStyle] = useState<string>("");
  const [generationError, setGenerationError] = useState<string | null>(null);
  const { toast } = useToast();

  const musicStyles = [
    { value: "ambient", label: "Ambient (30s)" },
    { value: "electronic", label: "Electronic (20s)" },
    { value: "cinematic", label: "Cinematic (25s)" },
    { value: "lofi", label: "Lo-Fi (10s)" },
  ];


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
      console.log('Calling edge function to generate music...');

      const { data, error } = await supabase.functions.invoke('generate-ai-music', {
        body: {
          prompt: prompt.trim(),
          instrumental: makeInstrumental,
          style: style || undefined,
        },
      });

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(error.message || 'Failed to generate music');
      }

      if (!data.success) {
        const errorType = data.errorType;
        if (errorType === 'rate_limit') {
          throw new Error('Rate limit exceeded. Please try again later.');
        } else if (errorType === 'payment_required') {
          throw new Error('API credits required. Please check your Suno API account.');
        }
        throw new Error(data.error || 'Failed to generate music');
      }

      console.log('Music generation initial response:', data.data);

      // Extract tracks from response
      let tracks = [];
      const responseData = data.data;

      if (Array.isArray(responseData)) {
        tracks = responseData;
      } else if (responseData.data && Array.isArray(responseData.data)) {
        tracks = responseData.data;
      } else if (responseData.clips && Array.isArray(responseData.clips)) {
        tracks = responseData.clips;
      } else if (responseData.tracks && Array.isArray(responseData.tracks)) {
        tracks = responseData.tracks;
      } else {
        tracks = [responseData];
      }

      console.log('Initial tracks (may need polling):', tracks);

      // Check if we need to poll for completion
      const needsPolling = tracks.some((track: any) =>
        !track.audio_url && !track.url && !track.audio && track.id
      );

      if (needsPolling && tracks.length > 0 && tracks[0].id) {
        toast({
          title: "Generating music...",
          description: "This may take 60-90 seconds. Please wait while your music is being created.",
        });

        // Poll for completion through edge function
        const taskIds = tracks.map((t: any) => t.id).filter(Boolean);
        console.log('Polling for task IDs:', taskIds);
        
        // Poll using the edge function's poll endpoint
        const maxAttempts = 45;
        const pollInterval = 2000;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          await new Promise(resolve => setTimeout(resolve, pollInterval));

          try {
            const { data: pollData, error: pollError } = await supabase.functions.invoke('generate-ai-music', {
              body: {
                poll: true,
                taskIds: taskIds,
              },
            });

            if (!pollError && pollData?.success && pollData?.data) {
              const pollTracks = Array.isArray(pollData.data) ? pollData.data : [pollData.data];
              const hasAnyAudio = pollTracks.some((track: any) =>
                track.audio_url || track.url || track.audio
              );

              if (hasAnyAudio && pollTracks.length > 0) {
                console.log('Found tracks with audio, using polled results...');
                tracks = pollTracks;
                break;
              }
            }
          } catch (pollError) {
            console.error('Polling error:', pollError);
          }
        }
      }

      console.log('Final tracks with audio:', tracks);

      if (!tracks || tracks.length === 0) {
        throw new Error('No music tracks were generated.');
      }

      const newTracks: GeneratedTrack[] = tracks.map((track: any) => ({
        id: track.id || track.song_id || Math.random().toString(36).substr(2, 9),
        title: track.title || track.name || prompt.substring(0, 30),
        audio_url: track.audio_url || track.url || track.audio || '',
        image_url: track.image_url || track.cover_url || track.image,
        tags: track.tags || track.metadata?.tags || prompt,
        duration: track.duration,
      }));

      // Filter out tracks without audio URLs
      const validTracks = newTracks.filter(t => t.audio_url);

      if (validTracks.length === 0) {
        throw new Error('Music generation is still processing. Please try again in a minute.');
      }

      setGeneratedTracks([...validTracks, ...generatedTracks]);

      toast({
        title: "Music generated!",
        description: `Generated ${validTracks.length} track(s). Click to play.`,
      });

      // Auto-play first track
      if (validTracks.length > 0 && validTracks[0].audio_url) {
        playAITrack(validTracks[0]);
      }

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
              placeholder="e.g., upbeat dance track, calm piano melody..."
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
            <Label className="text-sm font-medium">
              Style (optional)
            </Label>
            <div className="flex flex-wrap gap-2">
              {musicStyles.map((musicStyle) => (
                <button
                  key={musicStyle}
                  onClick={() => setStyle(style === musicStyle ? "" : musicStyle)}
                  disabled={isGenerating}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                    style === musicStyle
                      ? 'bg-primary text-primary-foreground shadow-lg scale-105'
                      : 'glass border border-border/30 hover:border-primary/50 hover:bg-primary/10'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {musicStyle}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Switch
                id="instrumental"
                checked={makeInstrumental}
                onCheckedChange={setMakeInstrumental}
                disabled={isGenerating}
              />
              <Label htmlFor="instrumental" className="text-sm cursor-pointer">
                Instrumental only
              </Label>
            </div>
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
