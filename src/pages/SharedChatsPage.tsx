import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Plus, Users, MessageSquare, Trash2, Lock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface ChatRow {
  id: string;
  title: string;
  owner_id: string;
  updated_at: string;
}

const FREE_SHARED_CHAT_LIMIT = 2;

export function SharedChatsPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { hasBoost, openCheckout } = useSubscription();
  const { toast } = useToast();
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");

  useEffect(() => {
    if (!authLoading && !user) navigate("/");
  }, [authLoading, user, navigate]);

  useEffect(() => { if (user) void load(); }, [user?.id]);

  async function load() {
    if (!user) return;
    setLoading(true);
    const [{ data: owned }, { data: memberRows }] = await Promise.all([
      supabase.from("shared_chats").select("id,title,owner_id,updated_at").eq("owner_id", user.id),
      supabase.from("shared_chat_members").select("chat_id").eq("user_id", user.id),
    ]);
    const memberIds = (memberRows ?? []).map((r) => r.chat_id);
    let memberChats: ChatRow[] = [];
    if (memberIds.length) {
      const { data } = await supabase
        .from("shared_chats")
        .select("id,title,owner_id,updated_at")
        .in("id", memberIds);
      memberChats = (data as any) ?? [];
    }
    const all = [...((owned as any) ?? []), ...memberChats];
    const dedup = Array.from(new Map(all.map((c) => [c.id, c])).values())
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    setChats(dedup);
    setLoading(false);
  }

  const ownedCount = chats.filter((c) => c.owner_id === user?.id).length;
  const atLimit = !hasBoost && ownedCount >= FREE_SHARED_CHAT_LIMIT;

  async function create() {
    if (!user || !newTitle.trim()) return;
    if (atLimit) {
      toast({
        title: "Free limit reached",
        description: `Free accounts can create up to ${FREE_SHARED_CHAT_LIMIT} shared chats. Upgrade to Boost for unlimited.`,
      });
      openCheckout();
      return;
    }
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
    if (!user || chat.owner_id !== user.id) return;
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

  return (
    <div className="min-h-screen w-full text-foreground" style={{ paddingTop: "calc(env(safe-area-inset-top) + 30px)" }}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")} className="gap-2 mb-4">
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </Button>
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <h1 className="text-3xl font-semibold flex items-center gap-3">
            <Users className="h-7 w-7 text-primary" /> Shared Chats
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Group conversations with Arc and the people you invite. Each chat fits the owner plus up to 5 others (6 total).
            {!hasBoost && (
              <> Free includes up to {FREE_SHARED_CHAT_LIMIT} chats ({ownedCount}/{FREE_SHARED_CHAT_LIMIT} used).</>
            )}
          </p>
        </motion.div>

        <GlassCard className="p-4 mb-6 flex gap-2">
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={atLimit ? "Upgrade to Boost for more" : "New shared chat title"}
            onKeyDown={(e) => e.key === "Enter" && create()}
            disabled={atLimit}
          />
          {atLimit ? (
            <Button onClick={openCheckout} className="gap-2">
              <Lock className="h-4 w-4" /> Upgrade
            </Button>
          ) : (
            <Button onClick={create} disabled={creating || !newTitle.trim()} className="gap-2">
              <Plus className="h-4 w-4" /> Create
            </Button>
          )}
        </GlassCard>

        {loading ? (
          <GlassCard className="p-8 text-center text-muted-foreground">Loading…</GlassCard>
        ) : chats.length === 0 ? (
          <GlassCard className="p-10 text-center">
            <MessageSquare className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground">No shared chats yet. Create one above to get started.</p>
          </GlassCard>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {chats.map((c) => {
              const isOwner = c.owner_id === user.id;
              return (
                <GlassCard
                  key={c.id}
                  onClick={() => navigate(`/shared/${c.id}`)}
                  className="p-4 cursor-pointer hover:bg-white/5 transition group"
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
                        className="opacity-0 group-hover:opacity-100 transition p-2 rounded-lg hover:bg-destructive/15 text-destructive disabled:opacity-50"
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
