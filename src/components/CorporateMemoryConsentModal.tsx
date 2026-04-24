import { useEffect, useState } from "react";
import { Brain, ShieldCheck, CloudOff, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useCorporateModeStore } from "@/store/useCorporateModeStore";
import { fetchCorporateMemorySnapshot } from "@/utils/corporateMemorySnapshot";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isMobileLocalDevice } from "@/utils/mobileLocal";

interface CorporateMemoryConsentModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * One-time (per device) consent dialog explaining how memories work in
 * Corporate Mode. Shown when the user enables Corporate Mode, and again on
 * next app open if `memoriesEnabled` is still null.
 */
export function CorporateMemoryConsentModal({
  open,
  onClose,
}: CorporateMemoryConsentModalProps) {
  const setMemoriesEnabled = useCorporateModeStore((s) => s.setMemoriesEnabled);
  const setMemorySnapshot = useCorporateModeStore((s) => s.setMemorySnapshot);
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const handleAllow = async () => {
    setBusy(true);
    try {
      const snapshot = await fetchCorporateMemorySnapshot();
      if (snapshot) {
        setMemorySnapshot(snapshot);
        setMemoriesEnabled(true);
        toast({
          title: "Memories cached on this device",
          description: "Arc will reference them while offline. Nothing is sent to the cloud.",
        });
      } else {
        // Still record consent — snapshot may have failed because user has no
        // memories yet; that's fine. We won't keep nagging.
        setMemoriesEnabled(true);
        toast({
          title: "No memories to cache yet",
          description: "Once you save memories online, you can refresh the snapshot from the Privacy panel.",
        });
      }
      onClose();
    } catch (err) {
      console.error("[Corporate Memory Consent] Allow failed:", err);
      toast({
        title: "Couldn't cache memories",
        description: "Please try again with an internet connection.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDeny = () => {
    setMemoriesEnabled(false);
    setMemorySnapshot(null);
    toast({
      title: "Memories off in Corporate Mode",
      description: "Arc won't reference your saved memories while Corporate Mode is on.",
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleDeny()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/15 border border-primary/30">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <DialogTitle>Use your memories on-device?</DialogTitle>
          </div>
          <DialogDescription className="pt-2">
            Corporate Mode runs entirely on your device. To still get personalized
            answers, Arc can pull a one-time copy of your saved memories down to
            this device and reference them locally.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 border border-border/40">
            <Brain className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">One-time download, then offline</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                We fetch your memories now and cache them on this device. After
                that, Corporate Mode reads them locally with no network calls.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 border border-border/40">
            <CloudOff className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">No new memories will be written</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Saving new memories requires the cloud, so it stays disabled while
                Corporate Mode is on.
              </p>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">
            You can change this any time from the Privacy / Corporate Mode panel
            in Settings.
          </p>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={handleDeny} disabled={busy}>
            Don't use memories
          </Button>
          <Button
            onClick={handleAllow}
            disabled={busy}
            className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium shadow-lg shadow-primary/20"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Caching…
              </>
            ) : (
              "Cache & use memories"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * App-root mounted gate: if Corporate Mode is on and the user has never been
 * asked about memory consent, prompt them on next app open.
 */
export function CorporateMemoryConsentGate() {
  const enabled = useCorporateModeStore((s) => s.enabled);
  const memoriesEnabled = useCorporateModeStore((s) => s.memoriesEnabled);
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (isMobileLocalDevice()) {
      setOpen(false);
      return;
    }
    // Only prompt when corp mode is active, user is logged in, and we've never asked.
    if (enabled && memoriesEnabled === null && user) {
      // Small delay so it doesn't fight other boot UI for attention.
      const t = setTimeout(() => setOpen(true), 800);
      return () => clearTimeout(t);
    }
  }, [enabled, memoriesEnabled, user]);

  return <CorporateMemoryConsentModal open={open} onClose={() => setOpen(false)} />;
}
