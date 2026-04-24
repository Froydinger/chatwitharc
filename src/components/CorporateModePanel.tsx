import { useState } from "react";
import { Lock, Unlock, ShieldCheck, Brain, BrainCircuit, RefreshCw, Loader2 } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useCorporateModeStore } from "@/store/useCorporateModeStore";
import { useLocalAIStore } from "@/store/useLocalAIStore";
import { useAccentStore } from "@/store/useAccentStore";
import { useArcStore } from "@/store/useArcStore";
import { useToast } from "@/hooks/use-toast";
import { CorporateMemoryConsentModal } from "@/components/CorporateMemoryConsentModal";
import { fetchCorporateMemorySnapshot } from "@/utils/corporateMemorySnapshot";
import { isMobileLocalDevice } from "@/utils/mobileLocal";

/**
 * Privacy / Corporate Mode panel.
 * Locks the app to local-only with no tools, forces Noir theme, restores cleanly on disable.
 */
export function CorporateModePanel() {
  const enabled = useCorporateModeStore((s) => s.enabled);
  const setEnabled = useCorporateModeStore((s) => s.setEnabled);
  const memoriesEnabled = useCorporateModeStore((s) => s.memoriesEnabled);
  const setMemoriesEnabled = useCorporateModeStore((s) => s.setMemoriesEnabled);
  const memorySnapshot = useCorporateModeStore((s) => s.memorySnapshot);
  const setMemorySnapshot = useCorporateModeStore((s) => s.setMemorySnapshot);
  const { selectedModelId, status } = useLocalAIStore();
  const accent = useAccentStore((s) => s.accentColor);
  const { toast } = useToast();

  const [consentOpen, setConsentOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const hasLocalModel = !!selectedModelId && status === "ready";
  const isMobileLocal = isMobileLocalDevice();

  const handleToggle = (v: boolean) => {
    const { isLoading, isGeneratingImage, messages, createNewSession } = useArcStore.getState();
    if (isLoading || isGeneratingImage) {
      toast({
        title: "Finish the current message first",
        description: "Wait for the response to complete before switching modes.",
        variant: "destructive",
      });
      return;
    }
    if (v && !hasLocalModel) {
      setEnabled(true, accent);
      toast({
        title: "Download a local model first",
        description: "Corporate Mode needs an on-device model. Open the Arc Local panel below to pick one.",
      });
      return;
    }
    setEnabled(v, accent);
    if (messages.length > 0) {
      createNewSession();
    }
    toast({
      title: v ? "Corporate Mode enabled" : "Corporate Mode disabled",
      description: v
        ? "Local-only. Tools, attachments, voice, and cloud chat are off. Theme locked to Noir."
        : "All features and your previous theme are back.",
    });

    // When enabling, prompt for memory consent if we've never asked.
    if (v && memoriesEnabled === null && !isMobileLocal) {
      setTimeout(() => setConsentOpen(true), 300);
    }
  };

  const handleMemoryToggle = (v: boolean) => {
    if (v) {
      // User flipping ON — open consent modal which will fetch the snapshot.
      setConsentOpen(true);
    } else {
      setMemoriesEnabled(false);
      setMemorySnapshot(null);
      toast({
        title: "Memories disabled in Corporate Mode",
        description: "Arc won't reference your saved memories on this device.",
      });
    }
  };

  const handleRefreshSnapshot = async () => {
    setRefreshing(true);
    try {
      const snap = await fetchCorporateMemorySnapshot();
      if (snap) {
        setMemorySnapshot(snap);
        toast({
          title: "Memories refreshed",
          description: "Latest memories are now cached on this device.",
        });
      } else {
        toast({
          title: "Couldn't refresh",
          description: "Make sure you're online and signed in, then try again.",
          variant: "destructive",
        });
      }
    } finally {
      setRefreshing(false);
    }
  };

  const cachedAt = memorySnapshot?.cached_at
    ? new Date(memorySnapshot.cached_at).toLocaleString()
    : null;
  const memoryCount = memorySnapshot?.memory_info
    ? memorySnapshot.memory_info.split('\n').filter((l) => l.trim()).length
    : 0;
  const blockCount = memorySnapshot?.context_blocks?.length || 0;

  return (
    <>
      <GlassCard variant="bubble" className="p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-primary/15 border border-primary/30">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-foreground">Privacy / Corporate Mode</h3>
              {enabled ? (
                <Lock className="h-4 w-4 text-primary" />
              ) : (
                <Unlock className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Locks Arc to your downloaded on-device model. No cloud calls, no tools, no attachments.
              New chats stay on this device until you turn it off.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border/40">
          <Label htmlFor="corp-toggle" className="flex flex-col cursor-pointer">
            <span className="text-sm font-medium">Enable Corporate Mode</span>
            <span className="text-[11px] text-muted-foreground mt-0.5">
              Forces Noir theme. Disables image gen, web search, voice, code, canvas, document analysis, and cloud sync.
            </span>
          </Label>
          <Switch id="corp-toggle" checked={enabled} onCheckedChange={handleToggle} />
        </div>

        {/* Memory snapshot controls — only meaningful when corp mode is on (or has been). */}
        <div className="space-y-3 p-3 rounded-xl bg-muted/20 border border-border/40">
          <div className="flex items-start gap-3">
            <BrainCircuit className="h-4 w-4 text-primary mt-1 shrink-0" />
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="corp-mem-toggle" className="flex flex-col cursor-pointer">
                  <span className="text-sm font-medium">Use my memories on-device</span>
                  <span className="text-[11px] text-muted-foreground mt-0.5">
                    Cache a one-time copy of your saved memories locally so Corporate Mode can still personalize answers — fully offline.
                  </span>
                </Label>
                <Switch
                  id="corp-mem-toggle"
                  checked={memoriesEnabled === true}
                  onCheckedChange={handleMemoryToggle}
                />
              </div>
            </div>
          </div>

          {memoriesEnabled === true && (
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/30">
              <div className="text-[11px] text-muted-foreground leading-tight">
                {memorySnapshot ? (
                  <>
                    <div className="flex items-center gap-1.5">
                      <Brain className="h-3 w-3 text-primary" />
                      <span>{memoryCount} memories · {blockCount} context blocks cached</span>
                    </div>
                    {cachedAt && <div className="opacity-70">Last synced: {cachedAt}</div>}
                  </>
                ) : (
                  <span>No snapshot cached yet.</span>
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleRefreshSnapshot}
                disabled={refreshing}
                className="h-7 px-2 text-xs"
              >
                {refreshing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <>
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Refresh
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        {enabled && !hasLocalModel && (
          <div className="text-xs text-muted-foreground p-3 rounded-xl bg-destructive/10 border border-destructive/30">
            No on-device model is loaded yet. Download one in <strong>Arc Local</strong> below — until then,
            messages can't be sent.
          </div>
        )}

        <div className="text-[11px] text-muted-foreground leading-relaxed">
          When you turn Corporate Mode off, your previous theme returns and all features come back online.
          Chats created during Corporate Mode stay on this device only. New memories can't be written while
          Corporate Mode is on — turn it off to save new ones.
        </div>
      </GlassCard>

      <CorporateMemoryConsentModal open={consentOpen} onClose={() => setConsentOpen(false)} />
    </>
  );
}
