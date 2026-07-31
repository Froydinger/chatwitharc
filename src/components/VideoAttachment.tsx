import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Download, VideoOff, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  getVideoObjectUrl,
  releaseVideoObjectUrl,
  downloadVideo,
  getVideoBlob,
  formatBytes,
} from "@/lib/videoStorage";

interface VideoAttachmentProps {
  jobId: string;
  prompt?: string;
  seconds?: number;
  size?: string;
}

/**
 * Plays a generated clip out of the browser's local cache.
 *
 * Generated videos are never uploaded to Supabase or R2 — a few MB each would
 * fill the project's storage quickly. The trade-off is that the clip only
 * exists on the device that made it, so this component has two jobs: play it
 * back, and be unambiguous that the copy is local and losable.
 */
export function VideoAttachment({ jobId, prompt, seconds, size }: VideoAttachmentProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [byteSize, setByteSize] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    let claimed = false;

    (async () => {
      const url = await getVideoObjectUrl(jobId);
      if (cancelled) {
        // Effect tore down mid-load — hand the reference straight back.
        if (url) releaseVideoObjectUrl(jobId);
        return;
      }
      if (url) claimed = true;
      setObjectUrl(url);
      const blob = await getVideoBlob(jobId);
      if (!cancelled) setByteSize(blob?.size ?? 0);
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
      if (claimed) releaseVideoObjectUrl(jobId);
    };
  }, [jobId]);

  const isPortrait = size === "720x1280";

  if (loading) {
    return (
      <div
        className={`glass-card rounded-2xl overflow-hidden bg-primary/5 animate-pulse ${
          isPortrait ? "aspect-[9/16] max-w-[240px]" : "aspect-video max-w-md"
        }`}
      />
    );
  }

  // Expected whenever the chat is opened somewhere other than the device that
  // rendered it, or after site data was cleared.
  if (!objectUrl) {
    return (
      <div
        className={`glass-card rounded-2xl border border-border/40 flex flex-col items-center justify-center gap-2 p-6 text-center ${
          isPortrait ? "aspect-[9/16] max-w-[240px]" : "aspect-video max-w-md"
        }`}
      >
        <VideoOff className="w-6 h-6 text-muted-foreground/60" />
        <p className="text-sm font-medium text-muted-foreground">Video no longer available</p>
        <p className="text-xs text-muted-foreground/70 leading-snug">
          Videos are saved on the device that made them, not in the cloud. This one isn't on this device.
        </p>
        {prompt && <p className="text-xs text-muted-foreground/50 italic mt-1 line-clamp-2">"{prompt}"</p>}
      </div>
    );
  }

  const handleDownload = async () => {
    const ok = await downloadVideo(jobId, `arc-video-${jobId.slice(0, 8)}.mp4`);
    if (!ok) {
      toast({
        title: "Couldn't save the video",
        description: "It's no longer in this browser's local cache.",
        variant: "destructive",
      });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col gap-1.5"
    >
      <div className={`glass-card rounded-2xl overflow-hidden ${isPortrait ? "max-w-[240px]" : "max-w-md"}`}>
        <video
          src={objectUrl}
          controls
          loop
          playsInline
          preload="metadata"
          className="w-full h-auto block rounded-2xl"
        />
      </div>

      <div className="flex items-center gap-2 px-1">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Where this video is stored"
                className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
              >
                <Info className="w-3 h-3" />
                <span>Saved on this device only</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[240px] text-xs leading-snug">
              This video isn't stored in the cloud. Clearing your cache or cookies will delete it, and it
              won't appear on your other devices. Download it to keep it.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {byteSize > 0 && (
          <span className="text-[10px] text-muted-foreground/40">{formatBytes(byteSize)}</span>
        )}
        {typeof seconds === "number" && seconds > 0 && (
          <span className="text-[10px] text-muted-foreground/40">{seconds}s</span>
        )}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleDownload}
          className="ml-auto h-6 px-2 text-[10px] gap-1 rounded-full text-primary/70 hover:text-primary hover:bg-primary/10"
        >
          <Download className="w-3 h-3" />
          Save
        </Button>
      </div>
    </motion.div>
  );
}
