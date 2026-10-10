import { Transition } from "@/components/transitions/Transition";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Users, MessageSquare, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useWorkspaceUI } from "@/workspace/WorkspaceContext";
import { WorkspaceSharedChatsView } from "@/workspace/WorkspaceSharedChatsView";

interface ChatRow {
  id: string;
  title: string;
  owner_id: string;
  updated_at: string;
}

export function SharedChatsPage() {
  const workspaceUI = useWorkspaceUI();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id;
  const { toast } = useToast();
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");

  useEffect(() => {
    if (!authLoading && !user) navigate("/");
  }, [authLoading, user, navigate]);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const [{ data: owned, error: ownedError }, { data: memberRows, error: memberError }] = await Promise.all([
      supabase.from("shared_chats").select("id,title,owner_id,updated_at").eq("owner_id", userId),
      supabase.from("shared_chat_members").select("chat_id").eq("user_id", userId),
    ]);
    if (ownedError || memberError) {
      setLoadError((ownedError || memberError)!.message);
      setLoading(false);
      return;
    }
    const memberIds = (memberRows ?? []).map((r) => r.chat_id);
    let memberChats: ChatRow[] = [];
    if (memberIds.length) {
      const { data, error } = await supabase
        .from("shared_chats")
        .select("id,title,owner_id,updated_at")
        .in("id", memberIds);
      if (error) {
        setLoadError(error.message);
        setLoading(false);
        return;
      }
      memberChats = (data as ChatRow[] | null) ?? [];
    }
    const all = [...((owned as ChatRow[] | null) ?? []), ...memberChats];
    const dedup = Array.from(new Map(all.map((c) => [c.id, c])).values())
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    setChats(dedup);
    setLoadError(null);
    setLoading(false);
  }, [userId]);

  useEffect(() => { if (userId) void load(); }, [userId, load]);

  async function create() {
    if (!user || !newTitle.trim() || creating) return;
    setCreating(true);
    const { data, error } = await supabase
      .from("shared_chats")
      .insert({ owner_id: user.id, title: newTitle.trim() })
      .select("id").single();
    if (error || !data) {
      toast({ title: "Could not create chat", description: error?.message, variant: "destructive" });
      setCreating(false); return;
    }
    await supabase.from("shared_chat_members").insert({ chat_id: data.id, user_id: user.id, role: "owner" });
    setCreating(false); setNewTitle("");
    navigate(`/shared/${data.id}`);
  }

  async function deleteChat(chat: ChatRow, e: React.MouseEvent) {
    e.stopPropagation();
    if (!user || chat.owner_id !== user.id || deletingId) return;
    if (!window.confirm(`Delete "${chat.title}"? This removes the chat for everyone in it.`)) return;
    setDeletingId(chat.id);
    // Wipe children first (no cascade FKs)
    await supabase.from("shared_chat_messages").delete().eq("chat_id", chat.id);
    await supabase.from("shared_chat_members").delete().eq("chat_id", chat.id);
    await supabase.from("shared_chat_invites").delete().eq("chat_id", chat.id);
    const { error } = await supabase.from("shared_chats").delete().eq("id", chat.id);
    setDeletingId(null);
    if (error) {
      toast({ title: "Couldn't delete", description: error.message, variant: "destructive" });
      return;
    }
    setChats((prev) => prev.filter((c) => c.id !== chat.id));
    toast({ title: "Shared chat deleted" });
  }

  if (authLoading || !user) return null;

  if (workspaceUI) return <WorkspaceSharedChatsView
    chats={chats} userId={user.id} loading={loading} error={loadError} onRetry={() => void load()}
    creating={creating} newTitle={newTitle} onTitleChange={setNewTitle} onCreate={create}
    deletingId={deletingId} onDelete={deleteChat} onOpen={id => navigate(`/shared/${id}`)}
  />;

  return (
    <div className="min-h-screen w-full bg-background text-foreground" style={{ paddingTop: "calc(var(--arcai-safe-area-top) + var(--arcai-desktop-titlebar-safe-area, 30px))" }}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="gap-2 mb-4">
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </Button>
        <Transition preset="panel"><div className="mb-6">
          <h1 className="text-3xl font-semibold flex items-center gap-3">
            <Users className="h-7 w-7 text-primary" /> Collab Chats
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Chat with up to six people. Mention @Arc for answers and web search; use your main Arc chat for other tools.
          </p>
        </div></Transition>

        <GlassCard className="p-4 mb-6 flex gap-2">
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="New Collab Chat title"
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
          <Button onClick={create} disabled={creating || !newTitle.trim()} className="gap-2">
            <Plus className="h-4 w-4" /> Create
          </Button>
        </GlassCard>

        {loading ? (
          <GlassCard className="p-8 text-center text-muted-foreground">Loading…</GlassCard>
        ) : chats.length === 0 ? (
          <GlassCard className="p-10 text-center">
            <MessageSquare className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground">No Collab Chats yet. Create one above to get started.</p>
          </GlassCard>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {chats.map((c) => {
              const isOwner = c.owner_id === user.id;
              return (
                <GlassCard
                  key={c.id}
                  onClick={() => navigate(`/shared/${c.id}`)}
                  className="p-4 cursor-pointer hover:bg-muted/50 transition group"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
                      <Users className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{c.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {isOwner ? "Owner" : "Member"} · Updated {new Date(c.updated_at).toLocaleString()}
                      </div>
                    </div>
                    {isOwner && (
                      <button
                        onClick={(e) => deleteChat(c, e)}
                        disabled={deletingId === c.id}
                        title="Delete chat"
                        className="opacity-70 hover:opacity-100 transition p-2 rounded-lg hover:bg-destructive/15 text-destructive disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </GlassCard>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
