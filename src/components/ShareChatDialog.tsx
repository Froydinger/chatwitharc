import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Copy, Check, Link2 } from "lucide-react";

interface ShareChatDialogProps {
  sessionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareChatDialog({ sessionId, open, onOpenChange }: ShareChatDialogProps) {
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareUrl = sessionId ? `${window.location.origin}/share/${sessionId}` : "";

  useEffect(() => {
    if (!open || !sessionId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("chat_sessions")
        .select("is_public")
        .eq("id", sessionId)
        .maybeSingle();
      if (!cancelled) {
        if (error) {
          toast.error("Couldn't load share status");
        } else {
          setIsPublic(!!data?.is_public);
        }
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, sessionId]);

  const handleToggle = async (next: boolean) => {
    if (!sessionId) return;
    setLoading(true);
    const { error } = await supabase
      .from("chat_sessions")
      .update({
        is_public: next,
        shared_at: next ? new Date().toISOString() : null,
      })
      .eq("id", sessionId);
    setLoading(false);
    if (error) {
      toast.error("Couldn't update share setting");
      return;
    }
    setIsPublic(next);
    toast.success(next ? "Public link enabled" : "Link disabled");
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Share this chat
          </DialogTitle>
          <DialogDescription>
            Anyone with the link can read this chat. They can't edit it, continue it, or see your other chats.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
          <div>
            <div className="text-sm font-medium">Public link</div>
            <div className="text-xs text-muted-foreground">
              {isPublic ? "On — anyone with the link can view" : "Off — only you can see this chat"}
            </div>
          </div>
          <Switch checked={isPublic} disabled={loading} onCheckedChange={handleToggle} />
        </div>

        {isPublic && (
          <div className="flex items-center gap-2">
            <Input readOnly value={shareUrl} className="font-mono text-xs" />
            <Button size="icon" variant="secondary" onClick={handleCopy} aria-label="Copy link">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        )}

        {isPublic && (
          <p className="text-xs text-muted-foreground">
            Turning this off will break any existing share links. You can turn it back on later, but the URL stays the same.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
