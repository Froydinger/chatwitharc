import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Home, ArrowRight, MessageSquare, Flag, Ban, ShieldOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MessageBubble } from "@/components/MessageBubble";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { createUGCReport } from "@/lib/ugcReports";
import type { Message } from "@/store/useArcStore";

interface SharedSession {
  id: string;
  title: string;
  user_id: string;
  is_public: boolean;
  messages: Message[];
}

export function SharedChatPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [session, setSession] = useState<SharedSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creatorBlocked, setCreatorBlocked] = useState(false);
  const [moderationBusy, setModerationBusy] = useState(false);

  // Force dark theme on share pages
  useEffect(() => {
    document.documentElement.classList.remove("light");
    document.documentElement.classList.add("dark");
    document.documentElement.classList.add("theme-ready");
  }, []);

  useEffect(() => {
    if (!sessionId) {
      setError("Missing chat id");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("chat_sessions")
        .select("id, title, user_id, is_public, messages")
        .eq("id", sessionId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setError("This shared chat isn't available.");
        setLoading(false);
        return;
      }
      if (!data.is_public) {
        setError("This chat isn't shared publicly.");
        setLoading(false);
        return;
      }
      const raw: unknown[] = Array.isArray(data.messages) ? data.messages : [];
      const messages: Message[] = raw.map((item) => {
        const message = item && typeof item === "object" ? item as Record<string, unknown> : {};
        return {
          ...message,
          timestamp: message.timestamp ? new Date(String(message.timestamp)) : new Date(),
        } as unknown as Message;
      });
      setSession({
        id: data.id,
        title: data.title || "Shared chat",
        user_id: data.user_id,
        is_public: data.is_public,
        messages,
      });
      if (user && !user.is_anonymous && data.user_id !== user.id) {
        const { data: block, error: blockError } = await supabase
          .from("user_blocks")
          .select("blocked_user_id")
          .eq("blocker_user_id", user.id)
          .eq("blocked_user_id", data.user_id)
          .maybeSingle();
        if (cancelled) return;
        if (blockError) {
          setError("Safety settings couldn't be loaded. Please reload this shared chat.");
          setLoading(false);
          return;
        }
        setCreatorBlocked(!!block);
      } else {
        setCreatorBlocked(false);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, user]);

  // Owner redirect → their normal editable chat view
  useEffect(() => {
    if (!authLoading && user && session && session.user_id === user.id) {
      navigate(`/chat/${session.id}`, { replace: true });
    }
  }, [user, authLoading, session, navigate]);

  const canModerate = !!user && !user.is_anonymous && !!session && session.user_id !== user.id;

  async function reportMessage(message: Message, index: number) {
    if (!user || !session || user.is_anonymous) {
      toast({ title: "Sign in to report", description: "Sign in to your ArcAI account to report shared content." });
      return;
    }
    setModerationBusy(true);
    try {
      await createUGCReport({
        subject: `Public shared chat: ${session.title}`,
        details: [
          "User reported a message in a public shared chat.",
          `Chat ID: ${session.id}`,
          `Message index: ${index + 1}`,
          `Message role: ${message.role}`,
          `Chat creator user ID: ${session.user_id}`,
          `Shared URL: ${window.location.href}`,
          `Message excerpt: ${String(message.content ?? "").slice(0, 1800)}`,
        ].join("\n"),
      });
      toast({ title: "Report sent", description: "Thanks. ArcAI support has received this content report." });
    } catch {
      toast({ title: "Report failed", description: "We couldn't send the report. Please try again.", variant: "destructive" });
    } finally {
      setModerationBusy(false);
    }
  }

  async function toggleCreatorBlock() {
    if (!user || !session || user.is_anonymous) {
      toast({ title: "Sign in to block", description: "Sign in to your ArcAI account to block this creator." });
      return;
    }
    setModerationBusy(true);
    try {
      const blocks = supabase.from("user_blocks");
      const result = creatorBlocked
        ? await blocks.delete().eq("blocker_user_id", user.id).eq("blocked_user_id", session.user_id)
        : await blocks.insert({ blocker_user_id: user.id, blocked_user_id: session.user_id });
      if (result.error) throw result.error;
      setCreatorBlocked(!creatorBlocked);
      toast({
        title: creatorBlocked ? "Creator unblocked" : "Creator blocked",
        description: creatorBlocked ? "You can view this shared chat again." : "This creator's shared chats are hidden from you.",
      });
    } catch {
      toast({ title: "Couldn't update block", description: "Please try again.", variant: "destructive" });
    } finally {
      setModerationBusy(false);
    }
  }

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground text-sm">Loading shared chat…</div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-background px-6 text-center">
        <MessageSquare className="h-10 w-10 text-muted-foreground" />
        <div>
          <h1 className="text-xl font-semibold text-foreground">Chat unavailable</h1>
          <p className="text-sm text-muted-foreground mt-1">{error || "We couldn't find that chat."}</p>
        </div>
        <Button asChild>
          <Link to="/">
            <Home className="h-4 w-4 mr-2" />
            Go home
          </Link>
        </Button>
      </div>
    );
  }

  if (creatorBlocked) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-5 bg-background px-6 text-center">
        <Ban className="h-10 w-10 text-muted-foreground" />
        <div>
          <h1 className="text-xl font-semibold text-foreground">Shared chat hidden</h1>
          <p className="mt-1 text-sm text-muted-foreground">You blocked this chat's creator, so their shared content is hidden.</p>
        </div>
        <Button onClick={toggleCreatorBlock} disabled={moderationBusy} variant="outline">
          <ShieldOff className="mr-2 h-4 w-4" /> Unblock creator and view
        </Button>
      </div>
    );
  }

  const isSignedIn = !!user;

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Top bar */}
      <header
        className="sticky top-0 z-40 flex items-center justify-between gap-3 px-4 py-3 border-b border-border/40 backdrop-blur-xl bg-background/60"
        style={{ paddingTop: "calc(var(--arcai-safe-area-top) + 12px)" }}
      >
        <Button asChild variant="ghost" size="sm" className="gap-2">
          <Link to="/">
            <Home className="h-4 w-4" />
            <span className="hidden sm:inline">Home</span>
          </Link>
        </Button>
        <div className="min-w-0 flex-1 text-center">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Shared chat</div>
          <h1 className="text-sm font-medium truncate">{session.title}</h1>
        </div>
        <div className="flex w-[72px] justify-end gap-1">
          {canModerate && (
            <Button variant="ghost" size="icon" onClick={toggleCreatorBlock} disabled={moderationBusy} aria-label="Block chat creator" title="Block chat creator">
              <Ban className="h-4 w-4" />
            </Button>
          )}
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 w-full overflow-y-auto">
        <div className="mx-auto w-full max-w-xl px-4 py-6 space-y-4">
          {session.messages.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-12">This chat has no messages yet.</div>
          ) : (
            session.messages.map((message, idx) => (
              <motion.div
                key={message.id || idx}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
              >
                <MessageBubble
                  message={message}
                  isLatestAssistant={false}
                  shouldAnimateTypewriter={false}
                  isThinking={false}
                />
                {canModerate && (
                  <div className="mt-1 flex justify-end px-2">
                    <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs text-muted-foreground" onClick={() => reportMessage(message, idx)} disabled={moderationBusy}>
                      <Flag className="h-3.5 w-3.5" /> Report
                    </Button>
                  </div>
                )}
              </motion.div>
            ))
          )}
          <div className="h-32" />
        </div>
      </main>

      {/* CTA replacing input bar */}
      <div
        className="sticky bottom-0 left-0 right-0 z-40 px-4 pt-3 pb-4 border-t border-border/40 backdrop-blur-xl bg-background/70"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
      >
        <div className="mx-auto w-full max-w-xl">
          <Button
            asChild
            size="lg"
            className="w-full rounded-2xl py-6 bg-primary text-white hover:bg-primary/90 hover:text-white shadow-lg shadow-primary/20 border-0"
          >
            <Link to="/" className="flex w-full items-center justify-center gap-2 text-white hover:text-white">
              Have your own conversation with Arc
              <ArrowRight className="h-4 w-4 text-white" />
            </Link>
          </Button>
          {isSignedIn && (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              You're viewing a chat shared by another user. Open ArcAI to start your own.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default SharedChatPage;
