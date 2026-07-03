import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Home, ArrowRight, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MessageBubble } from "@/components/MessageBubble";
import { Button } from "@/components/ui/button";
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

  const [session, setSession] = useState<SharedSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      const raw = Array.isArray(data.messages) ? (data.messages as any[]) : [];
      const messages: Message[] = raw.map((m) => ({
        ...m,
        timestamp: m?.timestamp ? new Date(m.timestamp) : new Date(),
      }));
      setSession({
        id: data.id,
        title: data.title || "Shared chat",
        user_id: data.user_id,
        is_public: data.is_public,
        messages,
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // Owner redirect → their normal editable chat view
  useEffect(() => {
    if (!authLoading && user && session && session.user_id === user.id) {
      navigate(`/chat/${session.id}`, { replace: true });
    }
  }, [user, authLoading, session, navigate]);

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

  const isSignedIn = !!user;

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Top bar */}
      <header
        className="sticky top-0 z-40 flex items-center justify-between gap-3 px-4 py-3 border-b border-border/40 backdrop-blur-xl bg-background/60"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
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
        <div className="w-[72px]" />
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
