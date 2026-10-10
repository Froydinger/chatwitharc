import { SettingsSurface } from '@/workspace/SettingsSurface';
import { useWorkspaceSettingsRows } from '@/workspace/settingsPresentation';
import { useEffect, useState, useCallback, type ReactNode } from "react";
import { Share2, Copy, Trash2, ExternalLink, Loader2 } from "lucide-react";
import { GlassButton } from "@/components/ui/glass-button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface SharedSessionRow {
  id: string;
  title: string | null;
  updated_at: string;
}

function SharedLinkActions({ workspace, children }: { workspace: boolean; children: ReactNode }) {
  return workspace ? <div className="workspace-shared-link-actions">{children}</div> : <>{children}</>;
}

export function SharedLinksCard() {
  const workspace = useWorkspaceSettingsRows();
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<SharedSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("chat_sessions")
      .select("id, title, updated_at")
      .eq("user_id", user.id)
      .eq("is_public", true)
      .order("updated_at", { ascending: false });
    if (!error && data) setRows(data as SharedSessionRow[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const shareUrl = (id: string) => `${window.location.origin}/share/${id}`;

  const copyLink = async (id: string) => {
    try {
      await navigator.clipboard.writeText(shareUrl(id));
      toast({ title: "Link copied", description: "Share link copied to clipboard." });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const revoke = async (id: string) => {
    setRevoking(id);
    const { error } = await supabase
      .from("chat_sessions")
      .update({ is_public: false })
      .eq("id", id)
      .eq("user_id", user!.id);
    setRevoking(null);
    if (error) {
      toast({ title: "Couldn't revoke link", description: error.message, variant: "destructive" });
      return;
    }
    setRows((r) => r.filter((row) => row.id !== id));
    toast({ title: "Share link revoked" });
  };

  return (
    <SettingsSurface className="p-5 space-y-4">
      <div className={workspace ? "workspace-settings-card-heading" : "flex items-center gap-3"}>
        <div className={workspace ? "workspace-settings-row-icon" : "h-9 w-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center"}>
          <Share2 className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">Shared chat links</h3>

        </div>
      </div>

      {loading ? (
        <div className={workspace ? "workspace-settings-note workspace-settings-icon-note" : "flex items-center gap-2 text-xs text-muted-foreground py-4"}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <p className={workspace ? "workspace-settings-note" : "text-xs text-muted-foreground py-2"}>
          You haven't shared any chats yet. Open a chat and tap Share to publish a read-only link.
        </p>
      ) : (
        <ul className={workspace ? "workspace-settings-shared-links" : "space-y-2 max-h-80 overflow-y-auto scrollbar-hide"}>
          {rows.map((row) => (
            <li
              key={row.id}
              className={workspace ? "workspace-settings-row workspace-shared-link" : "flex items-center gap-2 p-2.5 rounded-xl bg-muted/20 border border-border/40"}
            >
              <div className="min-w-0 flex-1">
                <p className={workspace ? "workspace-settings-row-title truncate" : "text-sm font-medium text-foreground truncate"}>
                  {row.title || "Untitled chat"}
                </p>
                <p className={workspace ? "workspace-settings-row-description" : "text-[11px] text-muted-foreground truncate"}>
                  Shared • {new Date(row.updated_at).toLocaleDateString()}
                </p>
              </div>
              <SharedLinkActions workspace={workspace}>
              <GlassButton
                size="sm"
                variant="ghost"
                onClick={() => copyLink(row.id)}
                title="Copy link"
                className="h-8 w-8 p-0"
              >
                <Copy className="h-3.5 w-3.5" />
              </GlassButton>
              <GlassButton
                size="sm"
                variant="ghost"
                onClick={() => window.open(shareUrl(row.id), "_blank")}
                title="Open link"
                className="h-8 w-8 p-0"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </GlassButton>
              <GlassButton
                size="sm"
                variant="ghost"
                onClick={() => revoke(row.id)}
                disabled={revoking === row.id}
                title="Revoke link"
                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
              >
                {revoking === row.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
              </GlassButton>
              </SharedLinkActions>
            </li>
          ))}
        </ul>
      )}
    </SettingsSurface>
  );
}

export default SharedLinksCard;
