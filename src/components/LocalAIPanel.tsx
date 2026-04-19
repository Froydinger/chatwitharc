import { useEffect, useState } from "react";
import { Cpu, Download, CheckCircle2, AlertTriangle, Crown, Trash2, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useLocalAIStore } from "@/store/useLocalAIStore";
import { useSubscription } from "@/hooks/useSubscription";
import {
  isWebGPUSupported,
  loadLocalModel,
  unloadLocalModel,
  getActiveLocalModelLabel,
} from "@/services/localAI";
import { useToast } from "@/hooks/use-toast";

export function LocalAIPanel() {
  const { isSubscribed } = useSubscription();
  const {
    enabled, setEnabled,
    status, progress, progressText, errorMessage,
    webgpuSupported,
    setStatus, setProgress, setError, setWebgpuSupported, reset,
  } = useLocalAIStore();
  const { toast } = useToast();
  const [activeLabel, setActiveLabel] = useState<string>('Gemma 2');

  useEffect(() => {
    isWebGPUSupported().then(setWebgpuSupported);
  }, [setWebgpuSupported]);

  const handleDownload = async () => {
    if (!isSubscribed) {
      toast({ title: 'Pro feature', description: 'Arc Local requires a Pro subscription.' });
      return;
    }
    setStatus('loading');
    setError(null);
    try {
      await loadLocalModel((e) => {
        setProgress(e.progress, e.text);
      });
      setStatus('ready');
      setProgress(1, 'Ready');
      setActiveLabel(getActiveLocalModelLabel());
      toast({ title: 'Arc Local is ready', description: 'On-device AI is loaded and ready to chat.' });
    } catch (err: any) {
      console.error('Local model load failed:', err);
      setError(err?.message || 'Failed to load local model');
      toast({ title: 'Load failed', description: err?.message || 'Could not load local model', variant: 'destructive' });
    }
  };

  const handleUnload = async () => {
    await unloadLocalModel();
    reset();
    setEnabled(false);
    toast({ title: 'Local model unloaded', description: 'Model cleared from memory.' });
  };

  const proLocked = !isSubscribed;
  const noWebGPU = webgpuSupported === false;

  return (
    <GlassCard className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-primary/15 border border-primary/30">
            <Cpu className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-foreground">Arc Local</h3>
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/30 flex items-center gap-1">
                <Crown className="h-2.5 w-2.5" /> Pro
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Run Gemma on your device. Private, offline, zero tokens.
            </p>
          </div>
        </div>
      </div>

      {proLocked && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-muted/30 border border-border/50">
          <Sparkles className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
          <p className="text-xs text-muted-foreground">
            Upgrade to Pro to unlock on-device AI. Cloud features stay unchanged.
          </p>
        </div>
      )}

      {noWebGPU && !proLocked && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/30">
          <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
          <div className="text-xs">
            <p className="text-foreground font-medium">WebGPU not available</p>
            <p className="text-muted-foreground mt-0.5">
              Use Chrome, Edge, Brave, or Arc on desktop with a modern GPU. Safari support is rolling out in iOS 18.2+.
            </p>
          </div>
        </div>
      )}

      {!proLocked && !noWebGPU && (
        <>
          {/* Status display */}
          {status === 'idle' && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                One-time download (~2.5GB). Cached forever in your browser. Fully offline after that.
              </p>
              <GlassButton onClick={handleDownload} className="w-full">
                <Download className="h-4 w-4 mr-2" />
                Download Gemma
              </GlassButton>
            </div>
          )}

          {status === 'loading' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{progressText || 'Downloading…'}</span>
                <span className="text-primary font-medium">{Math.round(progress * 100)}%</span>
              </div>
              <Progress value={progress * 100} className="h-2" />
              <p className="text-[10px] text-muted-foreground">
                Don't close this tab. Download resumes if interrupted.
              </p>
            </div>
          )}

          {status === 'ready' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-primary/10 border border-primary/30">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <div className="flex-1 text-xs">
                  <p className="text-foreground font-medium">{activeLabel} ready</p>
                  <p className="text-muted-foreground">Cached on this device.</p>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border/40">
                <Label htmlFor="local-toggle" className="flex flex-col cursor-pointer">
                  <span className="text-sm font-medium">Use local model when possible</span>
                  <span className="text-[11px] text-muted-foreground mt-0.5">
                    Auto-switches to cloud for image gen, search & voice.
                  </span>
                </Label>
                <Switch
                  id="local-toggle"
                  checked={enabled}
                  onCheckedChange={setEnabled}
                />
              </div>

              <button
                onClick={handleUnload}
                className="w-full flex items-center justify-center gap-2 text-xs text-muted-foreground hover:text-destructive transition-colors py-1.5"
              >
                <Trash2 className="h-3 w-3" />
                Unload from memory
              </button>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/30">
                <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
                <p className="text-xs text-foreground">{errorMessage || 'Failed to load model'}</p>
              </div>
              <GlassButton onClick={handleDownload} className="w-full">
                Try Again
              </GlassButton>
            </div>
          )}
        </>
      )}
    </GlassCard>
  );
}
