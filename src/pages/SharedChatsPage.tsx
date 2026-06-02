import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Plus, Users, MessageSquare } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
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
  member_count?: number;
}

export function SharedChatsPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  useEffect(() => {
    if (!authLoading && !user) navigate("/");
  }, [authLoading, user, navigate]);

  useEffect(() => { if (user) void load(); }, [user?.id]);

  async function load() {
    if (!user) return;
    setLoading(true);
    // Get chats user owns OR is a member of
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

  async function create() {
    if (!user || !newTitle.trim()) return;
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
          <p className="text-sm text-muted-foreground mt-1">Group conversations with Arc and the people you invite.</p>
        </motion.div>

        <GlassCard className="p-4 mb-6 flex gap-2">
          <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="New shared chat title" onKeyDown={(e) => e.key === "Enter" && create()} />
          <Button onClick={create} disabled={creating || !newTitle.trim()} className="gap-2">
            <Plus className="h-4 w-4" /> Create
          </Button>
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
            {chats.map((c) => (
              <GlassCard
                key={c.id}
                onClick={() => navigate(`/shared/${c.id}`)}
                className="p-4 cursor-pointer hover:bg-white/5 transition"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/15 text-primary flex items-center justify-center">
                    <Users className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{c.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.owner_id === user.id ? "Owner" : "Member"} · Updated {new Date(c.updated_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
