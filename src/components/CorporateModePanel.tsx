import { Lock, Unlock, ShieldCheck } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useCorporateModeStore } from "@/store/useCorporateModeStore";
import { useLocalAIStore } from "@/store/useLocalAIStore";
import { useAccentStore } from "@/store/useAccentStore";
import { useArcStore } from "@/store/useArcStore";
import { useToast } from "@/hooks/use-toast";

/**
 * Privacy / Corporate Mode panel.
 * Locks the app to local-only with no tools, forces Noir theme, restores cleanly on disable.
 */
export function CorporateModePanel() {
  const enabled = useCorporateModeStore((s) => s.enabled);
  const setEnabled = useCorporateModeStore((s) => s.setEnabled);
  const { selectedModelId, status } = useLocalAIStore();
  const accent = useAccentStore((s) => s.accentColor);
  const { toast } = useToast();

  const hasLocalModel = !!selectedModelId && status === "ready";

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
  };

  return (
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

      {enabled && !hasLocalModel && (
        <div className="text-xs text-muted-foreground p-3 rounded-xl bg-destructive/10 border border-destructive/30">
          No on-device model is loaded yet. Download one in <strong>Arc Local</strong> below — until then,
          messages can't be sent.
        </div>
      )}

      <div className="text-[11px] text-muted-foreground leading-relaxed">
        When you turn Corporate Mode off, your previous theme returns and all features come back online.
        Chats created during Corporate Mode stay on this device only.
      </div>
    </GlassCard>
  );
}
