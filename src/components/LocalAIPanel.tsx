import { useEffect, useState, useCallback } from "react";
import { Cpu, Download, CheckCircle2, AlertTriangle, Crown, Trash2, Sparkles, Zap, Gem } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useLocalAIStore } from "@/store/useLocalAIStore";
import { useSubscription } from "@/hooks/useSubscription";
import {
  isWebGPUSupported,
  loadLocalModel,
  unloadLocalModel,
  getCachedLocalModels,
  deleteCachedLocalModel,
  FAST_MODEL,
  QUALITY_MODEL,
} from "@/services/localAI";
import { useToast } from "@/hooks/use-toast";

interface ModelOption {
  id: string;
  name: string;
  size: string;
  blurb: string;
  Icon: typeof Zap;
}

const MODELS: ModelOption[] = [
  { id: FAST_MODEL,    name: "Llama 3.2 3B",  size: "~1.9 GB", blurb: "Fast, snappy replies. Best for most chats.",          Icon: Zap },
  { id: QUALITY_MODEL, name: "Gemma 2 9B",    size: "~5.0 GB", blurb: "Higher quality, slower. Best on M-series / strong GPU.", Icon: Gem },
];

export function LocalAIPanel() {
  const { isSubscribed } = useSubscription();
  const {
    enabled, setEnabled,
    status, progress, progressText, errorMessage,
    webgpuSupported,
    selectedModelId, setSelectedModelId,
    setStatus, setProgress, setError, setWebgpuSupported, reset,
  } = useLocalAIStore();
  const { toast } = useToast();

  const [cached, setCached] = useState<Record<string, boolean>>({});
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const isIOS = typeof navigator !== 'undefined' && (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1)
  );

  useEffect(() => { isWebGPUSupported().then(setWebgpuSupported); }, [setWebgpuSupported]);

  const refreshCache = useCallback(async () => {
    const c = await getCachedLocalModels();
    setCached(c);
    // Auto-pick a default selection if user has one cached but none selected.
    if (!selectedModelId) {
      const firstCached = MODELS.find(m => c[m.id])?.id;
      if (firstCached) setSelectedModelId(firstCached);
    }
    // If anything is cached, surface "ready" state.
    if (Object.values(c).some(Boolean) && status !== 'loading') {
      setStatus('ready');
      setProgress(1, 'Ready (cached)');
    }
  }, [selectedModelId, setSelectedModelId, setStatus, setProgress, status]);

  useEffect(() => { refreshCache(); /* eslint-disable-next-line */ }, []);

  const handleDownload = async (modelId: string) => {
    if (downloadingId) return;
    if (!isSubscribed) {
      toast({ title: 'Pro feature', description: 'Arc Local requires a Pro subscription.' });
      return;
    }
    const gpuOk = await isWebGPUSupported();
    setWebgpuSupported(gpuOk);
    if (!gpuOk) {
      toast({
        title: 'WebGPU not available',
        description: "iOS Safari doesn't support WebGPU. Use Chrome, Edge, Brave, or Arc on desktop.",
        variant: 'destructive',
      });
      return;
    }

    const label = MODELS.find(m => m.id === modelId)?.name ?? 'model';
    setDownloadingId(modelId);
    setStatus('loading');
    setError(null);
    setProgress(0.02, `Preparing ${label}…`);

    try {
      await loadLocalModel((e) => {
        const next = Math.max(e.progress, 0.05);
        setProgress(next, e.text || `Downloading ${label}… ${Math.round(next * 100)}%`);
      }, modelId);
      setSelectedModelId(modelId);
      setStatus('ready');
      setProgress(1, 'Ready');
      toast({ title: `${label} ready`, description: 'On-device AI is loaded and ready to chat.' });
      await refreshCache();
    } catch (err: any) {
      console.error('Local model load failed:', err);
      setError(err?.message || 'Failed to load local model');
      toast({ title: 'Load failed', description: err?.message || 'Could not load local model', variant: 'destructive' });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async (modelId: string) => {
    const label = MODELS.find(m => m.id === modelId)?.name ?? 'model';
    await unloadLocalModel();
    await deleteCachedLocalModel(modelId);
    if (selectedModelId === modelId) setSelectedModelId('');
    await refreshCache();
    const stillCached = await getCachedLocalModels();
    if (!Object.values(stillCached).some(Boolean)) {
      reset();
      setEnabled(false);
    }
    toast({ title: `${label} removed`, description: 'Model cleared from this device.' });
  };

  const handleSelect = async (modelId: string) => {
    setSelectedModelId(modelId);
    // Warm the engine in the background so the first reply is instant.
    try { await loadLocalModel(() => {}, modelId); } catch {}
  };

  const proLocked = !isSubscribed;
  const noWebGPU = webgpuSupported === false;
  const anyCached = Object.values(cached).some(Boolean);

  return (
    <GlassCard className="p-5 space-y-4">
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
            Run an on-device model. Private, offline, zero tokens. Pick the model that fits your machine.
          </p>
        </div>
      </div>

      {isIOS && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-muted/30 border border-border/50">
          <AlertTriangle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
          <div className="text-xs">
            <p className="text-foreground font-medium">Available on desktop</p>
            <p className="text-muted-foreground mt-0.5">
              iOS Safari doesn't support WebGPU yet. Open Arc on desktop (Chrome, Edge, Brave, Arc) or Android Chrome 121+.
            </p>
          </div>
        </div>
      )}

      {!isIOS && proLocked && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-muted/30 border border-border/50">
          <Sparkles className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
          <p className="text-xs text-muted-foreground">Upgrade to Pro to unlock on-device AI.</p>
        </div>
      )}

      {!isIOS && noWebGPU && !proLocked && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/30">
          <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
          <div className="text-xs">
            <p className="text-foreground font-medium">WebGPU not available</p>
            <p className="text-muted-foreground mt-0.5">Use Chrome, Edge, Brave, or Arc on desktop. Android Chrome 121+ also works.</p>
          </div>
        </div>
      )}

      {!isIOS && !proLocked && !noWebGPU && (
        <>
          {/* Per-model rows */}
          <div className="space-y-2">
            {MODELS.map(({ id, name, size, blurb, Icon }) => {
              const isCached = !!cached[id];
              const isActive = isCached && selectedModelId === id;
              const isDownloading = downloadingId === id;
              return (
                <div
                  key={id}
                  className={`p-3 rounded-xl border transition-colors ${
                    isActive ? 'bg-primary/10 border-primary/40' : 'bg-muted/20 border-border/40'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="p-1.5 rounded-lg bg-primary/15 border border-primary/30">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground">{name}</span>
                        <span className="text-[10px] text-muted-foreground">{size}</span>
                        {isCached && (
                          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/30 flex items-center gap-1">
                            <CheckCircle2 className="h-2.5 w-2.5" /> Downloaded
                          </span>
                        )}
                        {isActive && (
                          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary text-primary-foreground">
                            In use
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{blurb}</p>

                      {isDownloading && (
                        <div className="mt-2 space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground truncate">{progressText || 'Downloading…'}</span>
                            <span className="text-primary font-medium">{Math.round(progress * 100)}%</span>
                          </div>
                          <Progress value={progress * 100} className="h-1.5" />
                        </div>
                      )}

                      <div className="flex items-center gap-2 mt-2">
                        {!isCached && (
                          <button
                            type="button"
                            onClick={() => handleDownload(id)}
                            disabled={!!downloadingId}
                            className="glass-shimmer inline-flex h-8 items-center justify-center rounded-full px-3 text-xs font-medium text-foreground transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Download className="h-3 w-3 mr-1.5" />
                            {isDownloading ? 'Downloading…' : 'Download'}
                          </button>
                        )}
                        {isCached && !isActive && (
                          <button
                            type="button"
                            onClick={() => handleSelect(id)}
                            className="inline-flex h-8 items-center justify-center rounded-full px-3 text-xs font-medium text-foreground bg-muted/40 hover:bg-muted/60 transition-colors"
                          >
                            Use this model
                          </button>
                        )}
                        {isCached && (
                          <button
                            type="button"
                            onClick={() => handleDelete(id)}
                            className="inline-flex h-8 items-center justify-center rounded-full px-3 text-xs text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 className="h-3 w-3 mr-1.5" />
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Master toggle: only meaningful once at least one model is downloaded */}
          {anyCached && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border/40">
              <Label htmlFor="local-toggle" className="flex flex-col cursor-pointer">
                <span className="text-sm font-medium">Use local model when possible</span>
                <span className="text-[11px] text-muted-foreground mt-0.5">
                  Auto-switches to cloud for image gen, search & voice.
                </span>
              </Label>
              <Switch id="local-toggle" checked={enabled} onCheckedChange={setEnabled} />
            </div>
          )}

          {status === 'error' && errorMessage && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/30">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
              <p className="text-xs text-foreground">{errorMessage}</p>
            </div>
          )}
        </>
      )}
    </GlassCard>
  );
}
