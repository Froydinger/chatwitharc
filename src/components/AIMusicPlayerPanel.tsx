import { useState } from "react";
import { Sparkles, Play, Pause, Download, Loader2, Music2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GlassCard } from "@/components/ui/glass-card";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { getTempSunoKey } from "@/config/temp-api";

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
  const [makeInstrumental, setMakeInstrumental] = useState(false);
  const { toast } = useToast();

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
      // TEMPORARY: Direct API call until Supabase Edge Function can be deployed
      const apiKey = getTempSunoKey();

      console.log('Attempting to generate music...');

      // Try with CORS proxy first
      const corsProxy = 'https://corsproxy.io/?';
      const apiUrl = 'https://api.sunoapi.com/api/v1/gateway/generate/music';

      const response = await fetch(corsProxy + encodeURIComponent(apiUrl), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: '',
          tags: prompt.trim(),
          prompt: prompt.trim(),
          make_instrumental: makeInstrumental,
          wait_audio: true
        }),
      }).catch((fetchError) => {
        console.error('Fetch failed:', fetchError);
        throw new Error(`Network error: ${fetchError.message}. The API server may be blocking browser requests (CORS).`);
      });

      if (!response.ok) {
        const errorData = await response.text();
        let errorMessage = 'Failed to generate music';

        try {
          const errorJson = JSON.parse(errorData);
          errorMessage = errorJson.error?.message || errorJson.message || errorData;
        } catch (e) {
          // Use status-based error
        }

        if (response.status === 429) {
          errorMessage = 'Rate limit exceeded. Please try again later.';
        } else if (response.status === 402 || response.status === 403) {
          errorMessage = 'API credits required. Please check your Suno API account.';
        }

        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log('Suno API response:', data);

      // Extract tracks from response
      const tracks = data.data || data || [];

      if (tracks.length === 0) {
        throw new Error('No music tracks were generated');
      }

      const newTracks: GeneratedTrack[] = tracks.map((track: any) => ({
        id: track.id || track.song_id || Math.random().toString(36).substr(2, 9),
        title: track.title || track.name || prompt.substring(0, 30),
        audio_url: track.audio_url || track.url || '',
        image_url: track.image_url || track.cover_url,
        tags: track.tags || prompt,
        duration: track.duration,
      }));

      setGeneratedTracks([...newTracks, ...generatedTracks]);

      toast({
        title: "Music generated!",
        description: `Generated ${newTracks.length} track(s). Click to play.`,
      });

      // Auto-play first track
      if (newTracks.length > 0 && newTracks[0].audio_url) {
        playAITrack(newTracks[0]);
      }

    } catch (error: any) {
      console.error('Error generating music:', error);

      let errorMessage = error.message || "Failed to generate music. Please try again.";

      // Check if it's a CORS/network error
      if (error.message?.includes('CORS') || error.message?.includes('Network') || error.message?.includes('fetch')) {
        errorMessage = "Unable to connect to the music API. This feature requires the Supabase Edge Function to be deployed. Please try again when Lovable credits are available.";
      }

      toast({
        title: "Generation failed",
        description: errorMessage,
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
        <div className="glass rounded-lg p-3 border border-yellow-500/20 bg-yellow-500/5">
          <p className="text-xs text-yellow-600 dark:text-yellow-400">
            ⚠️ <strong>Beta Feature:</strong> Requires server deployment. If generation fails, the Edge Function needs to be deployed to Supabase (coming soon).
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
              placeholder="e.g., upbeat electronic dance music, calm piano melody..."
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
