import { ReplyActionsProvider } from "@/components/ReplyActionsProvider";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, UserPlus, Settings, Sparkles, Users, Loader2, Trash2, Mail, Flag, Ban, ShieldOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ThemedLogo } from "@/components/ThemedLogo";
import { MessageBubble } from "@/components/MessageBubble";
import { cn } from "@/lib/utils";
import { createUGCReport } from "@/lib/ugcReports";
import type { Message } from "@/store/useArcStore";

interface MsgAttachment { type: "image"; url: string }
interface Msg {
  id: string;
  chat_id: string;
  author_user_id: string | null;
  role: "user" | "assistant" | "system";
  content: string;
  attachments?: MsgAttachment[] | null;
  created_at: string;
}

interface Member {
  user_id: string;
  role: string;
  display_name?: string;
  avatar_url?: string | null;
}

interface PendingInvite { id: string; email: string }

interface ProfileInfo { display_name: string; avatar_url: string | null }


function initials(name?: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || name[0].toUpperCase();
}

function toArcMessage(m: Msg): Message {
  const imgs = (m.attachments ?? []).filter((a) => a?.type === "image" && a.url).map((a) => a.url);
  const isImage = imgs.length > 0;
  return {
    id: m.id,
    content: m.content,
    role: m.author_user_id === null ? "assistant" : "user",
    timestamp: new Date(m.created_at),
    type: isImage ? "image" : "text",
    ...(isImage ? { imageUrl: imgs[0], imageUrls: imgs } : {}),
  } as Message;
}

export function SharedChatRoomPage() {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [chat, setChat] = useState<{ id: string; title: string; owner_id: string } | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [profilesMap, setProfilesMap] = useState<Map<string, ProfileInfo>>(new Map());
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const blockedUserIdsRef = useRef<Set<string>>(new Set());
  const activeChatRef = useRef(chatId);
  activeChatRef.current = chatId;

  const loadAll = useCallback(async () => {
    if (!chatId || !user) return;
    const [{ data: c }, { data: msgs }, { data: mems }, { data: invs }] = await Promise.all([
      supabase.from("shared_chats").select("id,title,owner_id").eq("id", chatId).maybeSingle(),
      supabase.from("shared_chat_messages").select("*").eq("chat_id", chatId).order("created_at", { ascending: false }).limit(200),
      supabase.from("shared_chat_members").select("user_id,role").eq("chat_id", chatId),
      supabase.from("shared_chat_invites").select("id,email,accepted_at").eq("chat_id", chatId).is("accepted_at", null),
    ]);
    if (activeChatRef.current !== chatId) return;
    if (!c) { toast({ title: "Chat not found", variant: "destructive" }); navigate("/shared"); return; }
    const { data: blocks, error: blocksError } = await supabase
      .from("user_blocks")
      .select("blocked_user_id")
      .eq("blocker_user_id", user.id);
    if (blocksError) {
      toast({ title: "Safety settings unavailable", description: "Reload this Collab Chat in a moment.", variant: "destructive" });
      return;
    }
    const blocked = new Set((blocks ?? []).map((row) => row.blocked_user_id));
    blockedUserIdsRef.current = blocked;
    setBlockedUserIds(blocked);
    const visibleMessages = ((msgs as Msg[] | null) ?? []).reverse().filter((message) => !message.author_user_id || !blocked.has(message.author_user_id));
    setChat(c);
    setMessages(visibleMessages);
    setPendingInvites((invs ?? []).map((invite) => ({ id: invite.id, email: invite.email })));
    const userIds = Array.from(new Set([
      ...(mems ?? []).map((member) => member.user_id),
      ...visibleMessages.map((message) => message.author_user_id).filter((id): id is string => typeof id === "string"),
    ]));
    let map = new Map<string, ProfileInfo>();
    if (userIds.length) {
      const { data: profs } = await supabase.from("profiles").select("user_id, display_name, avatar_url").in("user_id", userIds);
      map = new Map<string, ProfileInfo>((profs ?? []).map((profile) => [profile.user_id, { display_name: profile.display_name?.trim() || "User", avatar_url: profile.avatar_url ?? null }]));
    }
    setProfilesMap(map);
    setMembers((mems ?? []).map((member) => ({ ...member, display_name: map.get(member.user_id)?.display_name ?? "User", avatar_url: map.get(member.user_id)?.avatar_url ?? null })));
    await supabase.from("shared_chat_members")
      .update({ last_read_at: new Date().toISOString() })
      .eq("chat_id", chatId).eq("user_id", user.id);
  }, [chatId, navigate, toast, user]);

  useEffect(() => { if (!authLoading && !user) navigate("/"); }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!user || !chatId) return;
    void loadAll();
    const ch = supabase
      .channel(`shared-${chatId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "shared_chat_messages", filter: `chat_id=eq.${chatId}` }, (payload) => {
        if (activeChatRef.current !== chatId) return;
        const incoming = payload.new as Msg;
        if (incoming.author_user_id && blockedUserIdsRef.current.has(incoming.author_user_id)) return;
        setMessages((prev) => prev.find((m) => m.id === incoming.id) ? prev : [...prev, incoming]);
        if (incoming.author_user_id === null) setAiThinking(false);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "shared_chat_messages", filter: `chat_id=eq.${chatId}` }, (payload) => {
        const deleted = payload.old as { id?: string };
        if (typeof deleted.id === "string") setMessages((prev) => prev.filter((m) => m.id !== deleted.id));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [loadAll, user, chatId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, aiThinking]);

  useEffect(() => {
    setMessages([]); setAiThinking(false); setSending(false); setText("");
  }, [chatId]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 24 * 6) + "px";
  }, [text]);

  async function revokeInvite(id: string) {
    const { error } = await supabase.from("shared_chat_invites").delete().eq("id", id);
    if (error) { toast({ title: "Couldn't revoke", description: error.message, variant: "destructive" }); return; }
    setPendingInvites((p) => p.filter((x) => x.id !== id));
  }

  async function removeMember(uid: string) {
    if (!chatId) return;
    const { error } = await supabase.from("shared_chat_members").delete().eq("chat_id", chatId).eq("user_id", uid);
    if (error) { toast({ title: "Couldn't remove", description: error.message, variant: "destructive" }); return; }
    setMembers((m) => m.filter((x) => x.user_id !== uid));
  }

  async function toggleBlockMember(uid: string, displayName?: string) {
    if (!user || uid === user.id) return;
    const shouldBlock = !blockedUserIdsRef.current.has(uid);
    if (shouldBlock && !window.confirm(`Block ${displayName || "this member"}? Their messages will be hidden from you in Collab Chats.`)) return;
    const { error } = shouldBlock
      ? await supabase.from("user_blocks").insert({ blocker_user_id: user.id, blocked_user_id: uid })
      : await supabase.from("user_blocks").delete().eq("blocker_user_id", user.id).eq("blocked_user_id", uid);
    if (error) {
      toast({ title: "Couldn't update block", description: "Please try again.", variant: "destructive" });
      return;
    }
    const next = new Set(blockedUserIdsRef.current);
    if (shouldBlock) next.add(uid);
    else next.delete(uid);
    blockedUserIdsRef.current = next;
    setBlockedUserIds(next);
    if (shouldBlock) {
      setMessages((current) => current.filter((message) => message.author_user_id !== uid));
      toast({ title: "Member blocked", description: "Their messages are hidden from you in Collab Chats." });
    } else {
      toast({ title: "Member unblocked" });
      void loadAll();
    }
  }

  async function reportMessage(message: Msg) {
    if (!user || user.is_anonymous) {
      toast({ title: "Sign in to report", description: "Sign in to your ArcAI account to report shared content." });
      return;
    }
    try {
      await createUGCReport({
        subject: `Shared chat: ${chat?.title || "Untitled"}`,
        details: [
          "User reported a message in a Collab Chat.",
          `Chat ID: ${chatId}`,
          `Message ID: ${message.id}`,
          `Message author user ID: ${message.author_user_id ?? "ArcAI assistant"}`,
          `Message role: ${message.role}`,
          `Message excerpt: ${message.content.slice(0, 1800)}`,
          `Attachments: ${(message.attachments ?? []).map((attachment) => attachment.url).join(", ") || "none"}`,
        ].join("\n"),
      });
      toast({ title: "Report sent", description: "ArcAI support has received this content report." });
    } catch {
      toast({ title: "Report failed", description: "We couldn't send the report. Please try again.", variant: "destructive" });
    }
  }

  async function send() {
    if (!user || !chatId || !text.trim() || sending || aiThinking) return;
    const content = text.trim();
    setText("");
    setSending(true);

    try {
      const mentionedNames = Array.from(content.matchAll(/@([\w-]+)/g)).map((m) => m[1].toLowerCase());
      const wantArc = mentionedNames.includes("arc");
      const mentionedIds: string[] = [];
      for (const [uid, info] of profilesMap.entries()) {
        const name = info.display_name;
        if (mentionedNames.some((n) => name.toLowerCase().replace(/\s+/g, "").includes(n.replace(/\s+/g, "")))) {
          if (uid !== user.id) mentionedIds.push(uid);
        }
      }

      const { data: sent, error } = await supabase.from("shared_chat_messages").insert([{
        chat_id: chatId,
        author_user_id: user.id,
        role: "user",
        content,
        mentions: mentionedIds,
      }]).select("*").single();

      if (activeChatRef.current !== chatId) return;
      if (error) {
        toast({ title: "Send failed", description: error.message, variant: "destructive" });
        setText(content);
        setSending(false);
        return;
      }

      if (sent) setMessages((prev) => prev.some((m) => m.id === sent.id) ? prev : [...prev, sent as Msg]);
      textareaRef.current?.focus();

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

      if (wantArc && sent) {
        setAiThinking(true);
        try {
          const { data, error: replyError } = await supabase.functions.invoke("shared-chat-respond", { body: { chat_id: chatId, message_id: sent.id } });
          if (activeChatRef.current !== chatId) return;
          if (replyError || data?.error) throw new Error(data?.error || "Arc couldn't reply. Try mentioning @Arc again.");
          if (data?.message) setMessages((prev) => prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message as Msg]);
        } catch (error) {
          if (activeChatRef.current !== chatId) return;
          toast({ title: "Arc couldn't reply", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
        } finally {
          if (activeChatRef.current === chatId) setAiThinking(false);
        }
      }
    } catch (error: unknown) {
      if (activeChatRef.current !== chatId) return;
      setText((current) => current || content);
      toast({ title: "Error", description: error instanceof Error ? error.message : String(error), variant: "destructive" });
    } finally {
      if (activeChatRef.current === chatId) setSending(false);
    }
  }

  async function invite() {
    if (!chatId || !inviteEmail.trim()) return;
    const { data, error } = await supabase.functions.invoke<{ status?: string }>("invite-to-shared-chat", {
      body: { chat_id: chatId, email: inviteEmail.trim() },
    });
    if (error) {
      toast({ title: "Invite failed", description: error.message, variant: "destructive" });
      return;
    }
    setInviteEmail("");
    if (data?.status === "added") {
      toast({ title: "Added", description: "They now have access." });
      void loadAll();
    } else {
      toast({ title: "Invite created", description: "They'll be added when they sign up." });
    }
  }

  const isOwner = chat?.owner_id === user?.id;
  const atMemberCap = members.length + pendingInvites.length >= 6;
  const lastAssistantId = [...messages].reverse().find((m) => m.author_user_id === null)?.id;

  if (authLoading || !user) return null;

  return (
    <ReplyActionsProvider scopeKey={chatId ?? "shared-chat"} replyIds={messages.filter(message => message.author_user_id === null).map(message => message.id)}>
    <div className="h-[100dvh] w-full bg-background text-foreground flex flex-col" style={{ paddingTop: "calc(var(--arcai-safe-area-top) + var(--arcai-desktop-titlebar-safe-area, 30px))" }}>
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
        <div ref={scrollRef} className="flex-1 overflow-y-auto pr-1 pb-6 space-y-5">
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground py-16">
              <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-60" />
              <p className="text-sm">Chat together. Mention <code className="px-1 py-0.5 rounded bg-muted">@Arc</code> for a reply or web search. Use your main Arc chat for other tools.</p>
            </div>
          )}
          {messages.map((m) => {
            const isMine = m.author_user_id === user.id;
            const isArc = m.author_user_id === null;
            const prof = m.author_user_id ? profilesMap.get(m.author_user_id) : undefined;
            const name = isArc ? "Arc" : prof?.display_name ?? "User";
            const avatarUrl = isArc ? null : prof?.avatar_url ?? null;
            const arcMsg = toArcMessage(m);

            return (
              <div key={m.id} className={`flex gap-2.5 items-start ${isMine ? "flex-row-reverse" : "flex-row"}`}>
                <Avatar className="h-8 w-8 mt-1 shrink-0 border border-white/10">
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
                <div className="min-w-0 flex-1 flex flex-col gap-1">
                  <div className={`text-[11px] text-muted-foreground px-1 ${isMine ? "text-right" : "text-left"}`}>
                    <span className="font-medium text-foreground/80">{name}{isArc && " · AI"}</span>
                    <span className="mx-1.5">·</span>
                    <span>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    {!isMine && !user.is_anonymous && (
                      <button onClick={() => void reportMessage(m)} className="ml-2 inline-flex items-center gap-1 rounded px-1 py-0.5 text-muted-foreground hover:text-foreground" aria-label="Report this message" title="Report this message">
                        <Flag className="h-3 w-3" /><span>Report</span>
                      </button>
                    )}
                  </div>
                  <MessageBubble
                    message={arcMsg}
                    isLatestAssistant={isArc && m.id === lastAssistantId}
                    shouldAnimateTypewriter={false}
                    isThinking={false}
                  />
                </div>
              </div>
            );
          })}
          {aiThinking && (
            <div className="flex gap-2.5 items-center animate-fade-in">
              <Avatar className="h-8 w-8 border border-primary/30">
                <div className="h-full w-full flex items-center justify-center bg-primary/15">
                  <ThemedLogo className="h-4 w-4" />
                </div>
              </Avatar>
              <div className="rounded-2xl px-4 py-3 bg-primary/10 border border-primary/20 shadow-[0_0_24px_rgba(var(--primary-rgb),0.15)] flex items-center gap-2.5">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm text-foreground/90 font-medium">Arc is thinking…</span>
                <span className="flex gap-1 ml-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary/70 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-primary/70 animate-bounce" style={{ animationDelay: "120ms" }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-primary/70 animate-bounce" style={{ animationDelay: "240ms" }} />
                </span>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Composer stays inside the viewport so mobile keyboards resize the room. */}
      <div
        className="shrink-0 z-30 px-4 pb-4 pointer-events-none"
        style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
      >
        <div className="max-w-3xl mx-auto pointer-events-auto relative">
          <div className="glass-dock">
            <div className="chat-input-halo flex items-center gap-3 rounded-full">
              <div className="flex-1 flex flex-col gap-2">
                <Textarea
                  ref={textareaRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Message everyone, or mention @Arc…"
                  rows={1}
                  className="!border-0 !bg-transparent text-foreground placeholder:text-muted-foreground resize-none min-h-[24px] max-h-[144px] leading-5 py-1.5 pl-0 pr-2 focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none text-[16px]"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); }
                  }}
                />
              </div>

              <button
                onClick={send}
                disabled={sending || aiThinking || !text.trim()}
                aria-label="Send"
                className={cn(
                  "shrink-0 h-10 w-10 rounded-full flex items-center justify-center transition-all duration-200 glass-shimmer",
                  text.trim()
                    ? "bg-primary/10 ring-1 ring-primary/40 text-primary hover:bg-primary/20 !shadow-[0_0_10px_rgba(var(--primary-rgb),0.25)]"
                    : "text-muted-foreground cursor-not-allowed opacity-30",
                )}
              >
                <ArrowRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>


      {/* Chat Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="glass-card max-w-md max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Collab Chat settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                People · {members.length + pendingInvites.length}/6
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
                    {m.role === "owner" ? (
                      <span className="text-[10px] uppercase tracking-wide text-primary font-medium">Owner</span>
                    ) : isOwner ? (
                      <button
                        onClick={() => removeMember(m.user_id)}
                        className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                        aria-label="Remove member"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                    {m.user_id !== user.id && (
                      <button
                        onClick={() => void toggleBlockMember(m.user_id, m.display_name)}
                        className="h-7 rounded-md px-2 flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-white/10 transition"
                        aria-label={blockedUserIds.has(m.user_id) ? "Unblock member" : "Block member"}
                      >
                        {blockedUserIds.has(m.user_id) ? <ShieldOff className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                        {blockedUserIds.has(m.user_id) ? "Unblock" : "Block"}
                      </button>
                    )}
                  </div>
                ))}
                {pendingInvites.map((inv) => (
                  <div key={inv.id} className="flex items-center gap-2.5 p-2 rounded-lg bg-white/5 opacity-80">
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="text-[10px] bg-white/10"><Mail className="h-3.5 w-3.5" /></AvatarFallback>
                    </Avatar>
                    <div className="flex-1 text-sm truncate">{inv.email}</div>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Pending</span>
                    {isOwner && (
                      <button
                        onClick={() => revokeInvite(inv.id)}
                        className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                        aria-label="Revoke invite"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
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
    </ReplyActionsProvider>
  );
}
