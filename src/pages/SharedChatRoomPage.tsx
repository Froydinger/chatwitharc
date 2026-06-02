import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Send, UserPlus, Users, Sparkles, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

interface Msg {
  id: string;
  chat_id: string;
  author_user_id: string | null;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
}

interface Member {
  user_id: string;
  role: string;
  display_name?: string;
}

export function SharedChatRoomPage() {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [chat, setChat] = useState<{ id: string; title: string; owner_id: string } | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [profilesMap, setProfilesMap] = useState<Map<string, string>>(new Map());
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!authLoading && !user) navigate("/"); }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!user || !chatId) return;
    void loadAll();
    const ch = supabase
      .channel(`shared-${chatId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "shared_chat_messages", filter: `chat_id=eq.${chatId}` }, (payload) => {
        setMessages((prev) => prev.find((m) => m.id === (payload.new as any).id) ? prev : [...prev, payload.new as any]);
        setAiThinking(false);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "shared_chat_messages", filter: `chat_id=eq.${chatId}` }, (payload) => {
        setMessages((prev) => prev.filter((m) => m.id !== (payload.old as any).id));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, chatId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, aiThinking]);

  async function loadAll() {
    if (!chatId || !user) return;
    const [{ data: c }, { data: msgs }, { data: mems }] = await Promise.all([
      supabase.from("shared_chats").select("id,title,owner_id").eq("id", chatId).maybeSingle(),
      supabase.from("shared_chat_messages").select("*").eq("chat_id", chatId).order("created_at", { ascending: true }).limit(200),
      supabase.from("shared_chat_members").select("user_id,role").eq("chat_id", chatId),
    ]);
    if (!c) { toast({ title: "Chat not found", variant: "destructive" }); navigate("/shared"); return; }
    setChat(c as any);
    setMessages((msgs as any) ?? []);
    const userIds = Array.from(new Set([...((mems as any[]) ?? []).map((m) => m.user_id), ...((msgs as any[]) ?? []).map((m) => m.author_user_id).filter(Boolean)]));
    if (userIds.length) {
      const { data: profs } = await supabase.from("profiles").select("user_id, display_name").in("user_id", userIds);
      const map = new Map((profs ?? []).map((p) => [p.user_id, p.display_name ?? "User"]));
      setProfilesMap(map);
      setMembers((mems as any[] ?? []).map((m) => ({ ...m, display_name: map.get(m.user_id) ?? "User" })));
    } else {
      setMembers((mems as any) ?? []);
    }
    // mark last_read
    await supabase.from("shared_chat_members")
      .update({ last_read_at: new Date().toISOString() })
      .eq("chat_id", chatId).eq("user_id", user.id);
  }

  async function send() {
    if (!user || !chatId || !text.trim() || sending) return;
    const content = text.trim();
    setText(""); setSending(true);
    // Parse mentions of users (matches profile display_name) or @arc
    const mentionedNames = Array.from(content.matchAll(/@([\w-]+)/g)).map((m) => m[1].toLowerCase());
    const wantArc = mentionedNames.includes("arc");
    const mentionedIds: string[] = [];
    for (const [uid, name] of profilesMap.entries()) {
      if (mentionedNames.some((n) => name.toLowerCase().replace(/\s+/g, "").includes(n.replace(/\s+/g, "")))) {
        if (uid !== user.id) mentionedIds.push(uid);
      }
    }

    const { error } = await supabase.from("shared_chat_messages").insert({
      chat_id: chatId, author_user_id: user.id, role: "user", content, mentions: mentionedIds,
    });
    setSending(false);
    if (error) {
      toast({ title: "Send failed", description: error.message, variant: "destructive" });
      setText(content);
      return;
    }
    await supabase.from("shared_chats").update({ updated_at: new Date().toISOString() }).eq("id", chatId);

    // Notify @mentioned humans via push
    if (mentionedIds.length) {
      supabase.functions.invoke("send-push-notification", {
        body: {
          user_ids: mentionedIds,
          payload: {
            title: `${profilesMap.get(user.id) ?? "Someone"} mentioned you`,
            body: content.slice(0, 140),
            url: `/shared/${chatId}`,
            tag: `mention-${chatId}`,
          },
        },
      }).catch(() => {});
    }

    if (wantArc) {
      setAiThinking(true);
      supabase.functions.invoke("shared-chat-respond", { body: { chat_id: chatId } })
        .catch((e) => { setAiThinking(false); toast({ title: "Arc couldn't reply", description: String(e), variant: "destructive" }); });
    }
  }

  async function invite() {
    if (!chatId || !inviteEmail.trim()) return;
    const { data, error } = await supabase.functions.invoke("invite-to-shared-chat", {
      body: { chat_id: chatId, email: inviteEmail.trim() },
    });
    if (error) {
      toast({ title: "Invite failed", description: error.message, variant: "destructive" });
      return;
    }
    setInviteEmail("");
    if ((data as any)?.status === "added") {
      toast({ title: "Added", description: "They now have access." });
      void loadAll();
    } else {
      toast({ title: "Invite created", description: "They'll be added when they sign up." });
    }
  }

  async function deleteMsg(m: Msg) {
    if (!confirm("Delete this message?")) return;
    await supabase.from("shared_chat_messages").delete().eq("id", m.id);
  }

  if (authLoading || !user) return null;

  const isOwner = chat?.owner_id === user.id;

  return (
    <div className="min-h-screen w-full text-foreground flex flex-col" style={{ paddingTop: "calc(env(safe-area-inset-top) + 30px)" }}>
      <div className="max-w-3xl w-full mx-auto px-4 sm:px-6 py-4 flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between gap-3 mb-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/shared")} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> All chats
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="gap-1" onClick={() => setShowInvite((v) => !v)}>
              <Users className="h-4 w-4" /> {members.length}
            </Button>
            {isOwner && (
              <Button variant="ghost" size="sm" className="gap-1" onClick={() => setShowInvite(true)}>
                <UserPlus className="h-4 w-4" /> Invite
              </Button>
            )}
          </div>
        </div>

        <h1 className="text-xl font-semibold mb-3 truncate">{chat?.title}</h1>

        {showInvite && (
          <GlassCard className="p-3 mb-3 space-y-2">
            <div className="text-xs text-muted-foreground">Members</div>
            <div className="flex flex-wrap gap-2">
              {members.map((m) => (
                <span key={m.user_id} className="text-xs px-2 py-1 rounded-full bg-white/5 border border-white/10">
                  {m.display_name} {m.role === "owner" && "· owner"}
                </span>
              ))}
            </div>
            {isOwner && (
              <div className="flex gap-2 pt-2">
                <Input placeholder="Invite by email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && invite()} />
                <Button onClick={invite} className="gap-2"><UserPlus className="h-4 w-4" /> Send</Button>
              </div>
            )}
          </GlassCard>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pr-1 pb-2">
          {messages.length === 0 && (
            <GlassCard className="p-8 text-center text-muted-foreground">
              <Sparkles className="h-8 w-8 mx-auto mb-2" />
              Say hi! Mention <code>@arc</code> to bring Arc into the conversation.
            </GlassCard>
          )}
          {messages.map((m) => {
            const isMine = m.author_user_id === user.id;
            const isArc = m.author_user_id === null;
            const name = isArc ? "Arc" : profilesMap.get(m.author_user_id!) ?? "User";
            return (
              <motion.div key={m.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 border ${isArc
                  ? "bg-primary/10 border-primary/30"
                  : isMine ? "bg-primary/20 border-primary/30" : "bg-white/5 border-white/10"}`}>
                  <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground mb-0.5">
                    <span>{name}{isArc && " · AI"}</span>
                    <div className="flex items-center gap-2">
                      <span>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      {(isMine || isOwner) && (
                        <button className="opacity-50 hover:opacity-100" onClick={() => deleteMsg(m)} title="Delete">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="whitespace-pre-wrap text-sm">{m.content}</div>
                </div>
              </motion.div>
            );
          })}
          {aiThinking && (
            <div className="flex justify-start">
              <div className="rounded-2xl px-3.5 py-2.5 border bg-primary/10 border-primary/30 text-sm text-muted-foreground">
                Arc is thinking…
              </div>
            </div>
          )}
        </div>

        <GlassCard className="p-2 mt-2 flex gap-2 items-end">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Message the group… use @arc to ask the AI"
            rows={1}
            className="min-h-[44px] max-h-40 resize-none border-0 bg-transparent focus-visible:ring-0"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
            }}
          />
          <Button onClick={send} disabled={sending || !text.trim()} className="gap-1"><Send className="h-4 w-4" /></Button>
        </GlassCard>
      </div>
    </div>
  );
}
