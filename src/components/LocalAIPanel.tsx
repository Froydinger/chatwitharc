import { useEffect, useState, useCallback } from "react";
import { Cpu, Download, CheckCircle2, AlertTriangle, Crown, Trash2, Sparkles, Zap, Gem, Mail, Loader2 } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { isMobileLocalDevice } from "@/utils/mobileLocal";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface ModelOption {
  id: string;
  name: string;
  size: string;
  blurb: string;
  Icon: typeof Zap;
  beta?: boolean;
  iosOnly?: boolean;
}

const DESKTOP_MODELS: ModelOption[] = [
  { id: FAST_MODEL,    name: "Llama 3.2 3B",  size: "~1.9 GB", blurb: "Fast, snappy replies. Best for most chats.",          Icon: Zap },
  { id: QUALITY_MODEL, name: "Gemma 2 9B",    size: "~5.0 GB", blurb: "Higher quality, slower. Best on M-series / strong GPU.", Icon: Gem },
];

export function LocalAIPanel() {
  const { isSubscribed } = useSubscription();
  const { user, profile } = useAuth();
  const {
    enabled, setEnabled,
    preferCloud, setPreferCloud,
    status, progress, progressText, errorMessage,
    webgpuSupported,
    selectedModelId, setSelectedModelId,
    setStatus, setProgress, setError, setWebgpuSupported, reset,
  } = useLocalAIStore();
  const { toast } = useToast();

  const [cached, setCached] = useState<Record<string, boolean>>({});
  const [cacheChecked, setCacheChecked] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [desktopEmail, setDesktopEmail] = useState("");
  const [sendingDesktopLink, setSendingDesktopLink] = useState(false);

  const isIOS = typeof navigator !== 'undefined' && (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1)
  );
  const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
  const isMobileLocal = isMobileLocalDevice();
  const inIframe = typeof window !== 'undefined' && (() => {
    try { return window.self !== window.top; } catch { return true; }
  })();

  const MODELS: ModelOption[] = DESKTOP_MODELS;

  useEffect(() => {
    if (user?.email) setDesktopEmail(user.email);
  }, [user?.email]);

  useEffect(() => {
    if (isMobileLocal) return;
    isWebGPUSupported().then(setWebgpuSupported);
  }, [isMobileLocal, setWebgpuSupported]);

  const refreshCache = useCallback(async () => {
    if (isMobileLocal) {
      setCacheChecked(true);
      return;
    }
    const c = await getCachedLocalModels();
    setCached(c);
    setCacheChecked(true);
    // Auto-pick a default selection if user has one cached but none selected.
    const anyCached = Object.values(c).some(Boolean);
    const selectedIsLegacyQwen = selectedModelId.toLowerCase().includes('qwen');
    if (selectedIsLegacyQwen) setSelectedModelId('');
    if (anyCached && (!selectedModelId || selectedIsLegacyQwen || !c[selectedModelId])) {
      const firstCached = MODELS.find(m => c[m.id])?.id ?? Object.keys(c).find(id => c[id]);
      if (firstCached) setSelectedModelId(firstCached);
    }
    // If anything is cached, surface "ready" state.
    if (anyCached && status !== 'loading') {
      setStatus('ready');
      setProgress(1, 'Ready (cached)');
    } else if (!anyCached && status === 'ready') {
      setStatus('idle');
      setProgress(0, '');
    }
  }, [isMobileLocal, selectedModelId, setSelectedModelId, setStatus, setProgress, status, MODELS]);

  useEffect(() => {
    refreshCache();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshCache();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
    /* eslint-disable-next-line */
  }, []);

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

  const handleSendDesktopLink = async () => {
    const email = desktopEmail.trim().toLowerCase();
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
    if (!emailOk) {
      toast({ title: 'Enter a valid email', description: 'Please use a valid email address.', variant: 'destructive' });
      return;
    }

    setSendingDesktopLink(true);
    try {
      const { error } = await supabase.functions.invoke('send-transactional-email', {
        body: {
          templateName: 'desktop-link',
          recipientEmail: email,
          idempotencyKey: `desktop-link-${email}-${new Date().toISOString().slice(0, 10)}`,
          templateData: {
            displayName: profile?.display_name || user?.user_metadata?.full_name || undefined,
            desktopUrl: 'https://askarc.chat/',
          },
        },
      });

      if (error) throw error;
      toast({ title: 'Desktop link sent', description: 'Check your inbox for the desktop link.' });
    } catch (error: any) {
      console.error('Desktop link email failed:', error);
      toast({ title: 'Could not send email', description: error?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setSendingDesktopLink(false);
    }
  };

  const proLocked = !isSubscribed;
  const noWebGPU = webgpuSupported === false;
  const anyCached = Object.values(cached).some(Boolean);

  if (isMobileLocal) {
    return (
      <GlassCard className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-primary/15 border border-primary/30">
            <Mail className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground">Open Arc on desktop</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Local models and Corporate Mode are desktop-only. Send yourself a link to use Arc Local on a computer.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Input
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="email"
            placeholder="you@example.com"
            value={desktopEmail}
            onChange={(e) => setDesktopEmail(e.target.value)}
          />
          <Button
            type="button"
            variant="glass"
            className="w-full"
            onClick={handleSendDesktopLink}
            disabled={sendingDesktopLink}
          >
            {sendingDesktopLink ? <Loader2 className="animate-spin" /> : <Mail />}
            {sendingDesktopLink ? 'Sending…' : 'Send desktop link'}
          </Button>
        </div>
      </GlassCard>
    );
  }

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

      {isMobileLocal && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 p-3 rounded-xl bg-primary/10 border border-primary/30">
            <Cpu className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
            <div className="text-xs">
              <p className="text-foreground font-medium flex items-center gap-1.5">
                Desktop required for Arc Local
              </p>
              <p className="text-muted-foreground mt-0.5 leading-relaxed">
                Mobile devices no longer offer Corporate Mode, local model downloads, or on-device Llama. Email yourself a desktop link below.
              </p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-muted/20 border border-border/40 space-y-3">
            <div className="flex items-start gap-2">
              <Mail className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Email me a desktop link</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  We’ll send you a quick link to open Arc on desktop with this same account.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Input
                type="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="email"
                placeholder="you@example.com"
                value={desktopEmail}
                onChange={(e) => setDesktopEmail(e.target.value)}
              />
              <Button
                type="button"
                variant="glass"
                className="w-full"
                onClick={handleSendDesktopLink}
                disabled={sendingDesktopLink}
              >
                {sendingDesktopLink ? <Loader2 className="animate-spin" /> : <Mail />}
                {sendingDesktopLink ? 'Sending…' : 'Send desktop link'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {!isMobileLocal && proLocked && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-muted/30 border border-border/50">
          <Sparkles className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
          <p className="text-xs text-muted-foreground">Upgrade to Pro to unlock on-device AI.</p>
        </div>
      )}

      {!isMobileLocal && noWebGPU && !proLocked && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/30">
          <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
          <div className="text-xs">
            <p className="text-foreground font-medium">WebGPU not available here</p>
            <p className="text-muted-foreground mt-0.5">
              {inIframe
                ? "WebGPU is blocked inside this preview frame. Open the app in its own tab (or install it as a PWA from your browser menu) and try again — it should work."
                : isIOS
                  ? "Your iOS version doesn't expose WebGPU. Update to iOS 26 or newer, or use Arc on desktop."
                  : isAndroid
                    ? "Use Chrome 121+ on Android (stock Chrome, not Samsung Internet). If you're inside an in-app browser, tap the menu → 'Open in Chrome'."
                    : "Use Chrome, Edge, Brave, or Arc on desktop. Android Chrome 121+ also works."}
            </p>
          </div>
        </div>
      )}

      {!isMobileLocal && !proLocked && !noWebGPU && (
        <>
          {!cacheChecked && (
            <div className="p-3 rounded-xl bg-muted/20 border border-border/40 text-xs text-muted-foreground">
              Verifying on-device model…
            </div>
          )}
          {/* Per-model rows */}
          <div className="space-y-2">
            {MODELS.map(({ id, name, size, blurb, Icon, beta }) => {
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
                        {beta && (
                          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/30">
                            Beta
                          </span>
                        )}
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
            <div className="space-y-2">
              {isMobileLocal ? (
                <div className="p-3 rounded-xl bg-muted/20 border border-border/40">
                  <p className="text-sm font-medium text-foreground">Available in Corporate Mode</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Mobile local stays private/offline and uses a compact prompt. Turn on Corporate Mode to use this model.
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border/40">
                  <Label htmlFor="local-toggle" className="flex flex-col cursor-pointer">
                    <span className="text-sm font-medium">Use local model when possible</span>
                    <span className="text-[11px] text-muted-foreground mt-0.5">
                      Auto-switches to cloud for image gen, search & voice.
                    </span>
                  </Label>
                  <Switch id="local-toggle" checked={enabled && !preferCloud} onCheckedChange={(v) => { setEnabled(v); if (v) setPreferCloud(false); }} />
                </div>
              )}

              {!isMobileLocal && <div className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border/40">
                <Label htmlFor="prefer-cloud-toggle" className="flex flex-col cursor-pointer">
                  <span className="text-sm font-medium">Always use cloud models</span>
                  <span className="text-[11px] text-muted-foreground mt-0.5">
                    Keep your local model installed but route every chat to the cloud.
                  </span>
                </Label>
                <Switch id="prefer-cloud-toggle" checked={preferCloud} onCheckedChange={setPreferCloud} />
              </div>}
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
