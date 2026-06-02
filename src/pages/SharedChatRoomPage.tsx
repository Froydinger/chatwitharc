import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Send, UserPlus, Settings, Sparkles, Trash2, Users } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ThemedLogo } from "@/components/ThemedLogo";

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
  avatar_url?: string | null;
}

interface ProfileInfo { display_name: string; avatar_url: string | null }

function initials(name?: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || name[0].toUpperCase();
}

export function SharedChatRoomPage() {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [chat, setChat] = useState<{ id: string; title: string; owner_id: string } | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [profilesMap, setProfilesMap] = useState<Map<string, ProfileInfo>>(new Map());
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  useEffect(() => { textareaRef.current?.focus(); }, [chatId]);

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
    const userIds = Array.from(new Set([
      ...((mems as any[]) ?? []).map((m) => m.user_id),
      ...((msgs as any[]) ?? []).map((m) => m.author_user_id).filter(Boolean),
    ]));
    if (userIds.length) {
      const { data: profs } = await supabase.from("profiles").select("user_id, display_name, avatar_url").in("user_id", userIds);
      const map = new Map<string, ProfileInfo>((profs ?? []).map((p: any) => [p.user_id, { display_name: p.display_name ?? "User", avatar_url: p.avatar_url ?? null }]));
      setProfilesMap(map);
      setMembers((mems as any[] ?? []).map((m) => ({ ...m, display_name: map.get(m.user_id)?.display_name ?? "User", avatar_url: map.get(m.user_id)?.avatar_url ?? null })));
    } else {
      setMembers((mems as any) ?? []);
    }
    await supabase.from("shared_chat_members")
      .update({ last_read_at: new Date().toISOString() })
      .eq("chat_id", chatId).eq("user_id", user.id);
  }

  async function send() {
    if (!user || !chatId || !text.trim() || sending) return;
    const content = text.trim();
    setText(""); setSending(true);
    const mentionedNames = Array.from(content.matchAll(/@([\w-]+)/g)).map((m) => m[1].toLowerCase());
    const wantArc = mentionedNames.includes("arc");
    const mentionedIds: string[] = [];
    for (const [uid, info] of profilesMap.entries()) {
      const name = info.display_name;
      if (mentionedNames.some((n) => name.toLowerCase().replace(/\s+/g, "").includes(n.replace(/\s+/g, "")))) {
        if (uid !== user.id) mentionedIds.push(uid);
      }
    }

    const { error } = await supabase.from("shared_chat_messages").insert({
      chat_id: chatId, author_user_id: user.id, role: "user", content, mentions: mentionedIds,
    });
    setSending(false);
    textareaRef.current?.focus();
    if (error) {
      toast({ title: "Send failed", description: error.message, variant: "destructive" });
      setText(content);
      return;
    }
    await supabase.from("shared_chats").update({ updated_at: new Date().toISOString() }).eq("id", chatId);

    if (mentionedIds.length) {
      supabase.functions.invoke("send-push-notification", {
        body: {
          user_ids: mentionedIds,
          payload: {
            title: `${profilesMap.get(user.id)?.display_name ?? "Someone"} mentioned you`,
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

  const isOwner = chat?.owner_id === user?.id;
  const atMemberCap = members.length >= 6;

  const markdownComponents = useMemo(() => ({
    p: ({ node, ...props }: any) => <p className="text-[15px] leading-relaxed mb-2 last:mb-0 text-foreground/90" {...props} />,
    a: ({ node, ...props }: any) => <a className="text-primary underline underline-offset-2" target="_blank" rel="noopener noreferrer" {...props} />,
    code: ({ inline, children, ...props }: any) => inline
      ? <code className="rounded bg-white/10 px-1.5 py-0.5 text-[13px] font-mono" {...props}>{children}</code>
      : <pre className="rounded-xl bg-black/40 border border-white/10 p-3 my-2 overflow-x-auto text-[13px] font-mono"><code {...props}>{children}</code></pre>,
    ul: ({ node, ...props }: any) => <ul className="list-disc pl-5 mb-2 space-y-1" {...props} />,
    ol: ({ node, ...props }: any) => <ol className="list-decimal pl-5 mb-2 space-y-1" {...props} />,
    h1: ({ node, ...props }: any) => <h1 className="text-lg font-semibold mb-1.5" {...props} />,
    h2: ({ node, ...props }: any) => <h2 className="text-base font-semibold mb-1.5" {...props} />,
    h3: ({ node, ...props }: any) => <h3 className="text-base font-semibold mb-1" {...props} />,
  }), []);

  if (authLoading || !user) return null;

  return (
    <div className="min-h-screen w-full text-foreground flex flex-col" style={{ paddingTop: "calc(env(safe-area-inset-top) + 30px)" }}>
      <div className="max-w-3xl w-full mx-auto px-4 sm:px-6 py-4 flex-1 flex flex-col min-h-0">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/shared")} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> All chats
          </Button>
          <h1 className="text-base sm:text-lg font-semibold truncate flex-1 text-center">{chat?.title}</h1>
          <Button variant="ghost" size="sm" onClick={() => setShowSettings(true)} className="gap-1.5">
            <Users className="h-4 w-4" />
            <span className="text-xs tabular-nums">{members.length}</span>
            <Settings className="h-4 w-4 ml-1 opacity-70" />
          </Button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto pr-1 pb-2 space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground py-16">
              <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-60" />
              <p className="text-sm">Say hi! Mention <code className="px-1 py-0.5 rounded bg-white/10">@arc</code> to bring Arc into the conversation.</p>
            </div>
          )}
          {messages.map((m) => {
            const isMine = m.author_user_id === user.id;
            const isArc = m.author_user_id === null;
            const prof = m.author_user_id ? profilesMap.get(m.author_user_id) : undefined;
            const name = isArc ? "Arc" : prof?.display_name ?? "User";
            const avatarUrl = isArc ? null : prof?.avatar_url ?? null;

            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-3 ${isMine ? "flex-row-reverse" : "flex-row"}`}
              >
                {/* Avatar */}
                <Avatar className="h-8 w-8 mt-0.5 shrink-0 border border-white/10">
                  {isArc ? (
                    <div className="h-full w-full flex items-center justify-center bg-primary/15">
                      <ThemedLogo className="h-4 w-4" />
                    </div>
                  ) : avatarUrl ? (
                    <AvatarImage src={avatarUrl} alt={name} />
                  ) : (
                    <AvatarFallback className="text-[11px] bg-white/10">{initials(name)}</AvatarFallback>
                  )}
                </Avatar>

                {/* Bubble */}
                <div className={`min-w-0 max-w-[85%] ${isMine ? "items-end" : "items-start"} flex flex-col gap-1`}>
                  <div className={`flex items-center gap-2 text-[11px] text-muted-foreground px-0.5 ${isMine ? "flex-row-reverse" : ""}`}>
                    <span className="font-medium text-foreground/80">{name}{isArc && " · AI"}</span>
                    <span>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    {(isMine || isOwner) && (
                      <button className="opacity-50 hover:opacity-100 transition-opacity" onClick={() => deleteMsg(m)} title="Delete">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  {isArc ? (
                    <div className="prose prose-invert max-w-none text-[15px] leading-relaxed text-foreground/90">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                        {m.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <div className={`rounded-2xl px-4 py-2.5 border ${isMine
                      ? "bg-primary text-primary-foreground border-primary/40 rounded-tr-md"
                      : "bg-white/[0.06] border-white/10 rounded-tl-md"}`}>
                      <div className="prose prose-invert max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                          {m.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
          {aiThinking && (
            <div className="flex gap-3 items-center">
              <Avatar className="h-8 w-8 border border-white/10">
                <div className="h-full w-full flex items-center justify-center bg-primary/15">
                  <ThemedLogo className="h-4 w-4" />
                </div>
              </Avatar>
              <div className="text-sm text-muted-foreground italic">Arc is thinking…</div>
            </div>
          )}
        </div>

        {/* Composer — matches regular chat glass-dock */}
        <div className="glass-dock mt-3 p-2 flex gap-2 items-end rounded-2xl">
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Message the group… use @arc to ask the AI"
            rows={1}
            className="min-h-[44px] max-h-40 resize-none border-0 bg-transparent focus-visible:ring-0 text-[15px]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
            }}
          />
          <Button onClick={send} disabled={sending || !text.trim()} size="icon" className="rounded-xl shrink-0">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Chat Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Chat settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                People · {members.length}/6
              </div>
              <div className="space-y-1.5">
                {members.map((m) => (
                  <div key={m.user_id} className="flex items-center gap-2.5 p-2 rounded-lg bg-white/5">
                    <Avatar className="h-7 w-7">
                      {m.avatar_url
                        ? <AvatarImage src={m.avatar_url} alt={m.display_name} />
                        : <AvatarFallback className="text-[10px] bg-white/10">{initials(m.display_name)}</AvatarFallback>}
                    </Avatar>
                    <div className="flex-1 text-sm truncate">
                      {m.display_name}{m.user_id === user.id && " (you)"}
                    </div>
                    {m.role === "owner" && (
                      <span className="text-[10px] uppercase tracking-wide text-primary font-medium">Owner</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {isOwner && (
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Invite by email</div>
                <div className="flex gap-2">
                  <Input
                    placeholder="name@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && invite()}
                    disabled={atMemberCap}
                  />
                  <Button onClick={invite} disabled={atMemberCap || !inviteEmail.trim()} className="gap-1.5 shrink-0">
                    <UserPlus className="h-4 w-4" /> Invite
                  </Button>
                </div>
                <div className="text-[11px] text-muted-foreground mt-1.5">
                  {atMemberCap ? "Chat is full — owner plus up to 5 others (6 total)." : "Owner plus up to 5 others (6 total)."}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
