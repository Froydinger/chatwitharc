import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, UserPlus, Settings, Sparkles, Users, Plus, ImagePlus, X, Loader2 } from "lucide-react";
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
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [imageMode, setImageMode] = useState(false);
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
        if ((payload.new as any).author_user_id === null) setAiThinking(false);
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

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 24 * 6) + "px";
  }, [text]);

  async function loadAll() {
    if (!chatId || !user) return;
    const [{ data: c }, { data: msgs }, { data: mems }, { data: invs }] = await Promise.all([
      supabase.from("shared_chats").select("id,title,owner_id").eq("id", chatId).maybeSingle(),
      supabase.from("shared_chat_messages").select("*").eq("chat_id", chatId).order("created_at", { ascending: true }).limit(200),
      supabase.from("shared_chat_members").select("user_id,role").eq("chat_id", chatId),
      supabase.from("shared_chat_invites").select("id,email,accepted_at").eq("chat_id", chatId).is("accepted_at", null),
    ]);
    if (!c) { toast({ title: "Chat not found", variant: "destructive" }); navigate("/shared"); return; }
    setChat(c as any);
    setMessages((msgs as any) ?? []);
    setPendingInvites(((invs as any[]) ?? []).map((i) => ({ id: i.id, email: i.email })));
    const userIds = Array.from(new Set([
      ...((mems as any[]) ?? []).map((m) => m.user_id),
      ...((msgs as any[]) ?? []).map((m) => m.author_user_id).filter(Boolean),
    ]));
    if (userIds.length) {
      const { data: profs } = await supabase.from("profiles").select("user_id, display_name, avatar_url").in("user_id", userIds);
      const map = new Map<string, ProfileInfo>((profs ?? []).map((p: any) => [p.user_id, { display_name: p.display_name?.trim() || "User", avatar_url: p.avatar_url ?? null }]));
      setProfilesMap(map);
      setMembers((mems as any[] ?? []).map((m) => ({ ...m, display_name: map.get(m.user_id)?.display_name ?? "User", avatar_url: map.get(m.user_id)?.avatar_url ?? null })));
    } else {
      setMembers((mems as any) ?? []);
    }
    await supabase.from("shared_chat_members")
      .update({ last_read_at: new Date().toISOString() })
      .eq("chat_id", chatId).eq("user_id", user.id);
  }

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

  async function generateSharedImage(prompt: string) {
    setAiThinking(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-image", { body: { prompt } });
      if (error || !data?.success || !data?.imageUrl) {
        throw new Error(data?.error || error?.message || "Image generation failed");
      }
      await supabase.from("shared_chat_messages").insert({
        chat_id: chatId,
        author_user_id: null,
        role: "assistant",
        content: `🎨 ${prompt}`,
        attachments: [{ type: "image", url: data.imageUrl }],
      });
    } catch (e: any) {
      toast({ title: "Image generation failed", description: String(e?.message ?? e), variant: "destructive" });
    } finally {
      setAiThinking(false);
    }
  }

  async function send() {
    if (!user || !chatId || !text.trim() || sending) return;
    let content = text.trim();
    setText(""); setSending(true);

    // /image command or active image mode
    const imageMatch = content.match(/^\/image\s+(.+)/i);
    const wantImage = imageMode || !!imageMatch;
    const imagePrompt = imageMatch ? imageMatch[1] : content;

    const mentionedNames = Array.from(content.matchAll(/@([\w-]+)/g)).map((m) => m[1].toLowerCase());
    const wantArc = mentionedNames.includes("arc") && !wantImage;
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
    setImageMode(false);
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

    if (wantImage) {
      void generateSharedImage(imagePrompt);
    } else if (wantArc) {
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

  const isOwner = chat?.owner_id === user?.id;
  const atMemberCap = members.length >= 6;
  const lastAssistantId = [...messages].reverse().find((m) => m.author_user_id === null)?.id;

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
        <div ref={scrollRef} className="flex-1 overflow-y-auto pr-1 pb-40 space-y-5">
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground py-16">
              <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-60" />
              <p className="text-sm">Say hi! Mention <code className="px-1 py-0.5 rounded bg-white/10">@arc</code> to bring Arc in, or use <code className="px-1 py-0.5 rounded bg-white/10">/image</code> to generate one.</p>
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

        {/* Composer — mirrors ChatInput shell exactly */}
        <div className="mt-3 relative">
          {/* + menu popover */}
          {showPlusMenu && (
            <div className="absolute bottom-full left-0 mb-3 z-30">
              <div className="glass-shimmer rounded-full px-3 py-2 ring-[0.5px] ring-border/40 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,.3)] flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => { setImageMode(true); setShowPlusMenu(false); textareaRef.current?.focus(); }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium text-green-400 hover:bg-white/10 active:scale-95 transition"
                >
                  <ImagePlus className="h-4 w-4" />
                  <span className="text-foreground/80">Image</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowPlusMenu(false)}
                  className="flex items-center justify-center h-7 w-7 rounded-full hover:bg-white/10 active:scale-95 transition text-muted-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          <div className="chat-input-halo flex items-center gap-3 rounded-full">
            {/* LEFT BUTTON — + menu or image-mode indicator */}
            <button
              type="button"
              aria-label={imageMode ? "Disable image mode" : showPlusMenu ? "Close menu" : "Quick options"}
              onClick={() => {
                if (imageMode) setImageMode(false);
                else setShowPlusMenu((v) => !v);
              }}
              className={cn(
                "shrink-0 h-10 w-10 rounded-full flex items-center justify-center transition-colors duration-200 relative glass-shimmer",
                imageMode
                  ? "!bg-green-500/20 ring-1 ring-green-400/50 !shadow-[0_0_24px_rgba(34,197,94,0.25)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {imageMode ? (
                <>
                  <ImagePlus className="h-5 w-5 text-green-400" />
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-black/70 text-white text-[10px] flex items-center justify-center">×</span>
                </>
              ) : (
                <Plus className="h-5 w-5" />
              )}
            </button>

            {/* Input */}
            <div className="flex-1">
              <Textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={imageMode ? "Describe an image…" : "Message the group… @arc or /image"}
                rows={1}
                className="!border-0 !bg-transparent text-foreground placeholder:text-muted-foreground resize-none min-h-[24px] max-h-[144px] leading-5 py-1.5 pl-0 pr-2 focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none text-[16px]"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
                }}
              />
            </div>

            {/* Send */}
            <button
              onClick={send}
              disabled={sending || !text.trim()}
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
