import { useEffect, useRef, useState, KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Send, Globe, Sparkles, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AuthModal } from "@/components/AuthModal";
import { useAnonChatStore } from "@/store/useAnonChatStore";
import { cn } from "@/lib/utils";

const ANON_ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL || "https://jxywhodnndagbsmnbnnw.supabase.co"}/functions/v1/anon-chat`;

export function AnonChat() {
  const { messages, repliesToday, limit, append, updateLast, newChat, setUsage, markForMigration } =
    useAnonChatStore();
  const [input, setInput] = useState("");
  const [searchOn, setSearchOn] = useState(false);
  const [sending, setSending] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [limitHit, setLimitHit] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Keep textarea focused
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [input]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    if (limitHit) {
      setAuthOpen(true);
      return;
    }

    append({ role: "user", content: text });
    setInput("");
    setSending(true);
    // Placeholder assistant message
    append({ role: "assistant", content: "" });

    try {
      // Build outgoing messages array from store state at this moment
      const current = useAnonChatStore.getState().messages
        .filter((m) => !(m.role === "assistant" && m.content === ""))
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch(ANON_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: current, search: searchOn }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 429 && data?.error === "daily_limit") {
        setLimitHit(true);
        markForMigration();
        updateLast({
          content:
            "You've reached today's free anonymous limit (25 replies). Sign up for a free account to keep chatting — this conversation will be saved to your history.",
        });
        setTimeout(() => setAuthOpen(true), 400);
        return;
      }

      if (!res.ok) {
        updateLast({
          content: data?.error || "Something went wrong. Please try again in a moment.",
        });
        return;
      }

      updateLast({
        content: data.reply || "(no response)",
        sources: data.sources && data.sources.length ? data.sources : undefined,
      });
      if (typeof data.repliesToday === "number") {
        setUsage(data.repliesToday, data.limit ?? 25);
        if (data.repliesToday >= (data.limit ?? 25)) {
          setLimitHit(true);
          markForMigration();
        }
      }
    } catch (e: any) {
      console.error("anon send error:", e);
      updateLast({ content: "Connection error. Please try again." });
    } finally {
      setSending(false);
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewChat = () => {
    newChat();
    setInput("");
    setLimitHit(false);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const handleSignUp = () => {
    if (messages.length) markForMigration();
    setAuthOpen(true);
  };

  return (
    <div className="flex flex-col h-[100dvh] w-full max-w-3xl mx-auto px-3 sm:px-6">
      {/* Header */}
      <div
        className="flex items-center justify-between gap-2 pt-3 pb-2 shrink-0"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <img src="/arc-logo-ui.png" alt="ArcAI" className="h-7 w-7 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">ArcAI</div>
            <div className="text-[11px] text-muted-foreground truncate">
              Anonymous · {Math.max(0, limit - repliesToday)} / {limit} replies left today
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleNewChat}
            className="h-8 px-3 rounded-full text-xs font-medium text-foreground/80 hover:text-foreground bg-foreground/5 hover:bg-foreground/10 transition-colors flex items-center gap-1.5"
            aria-label="New chat"
          >
            <Plus className="h-3.5 w-3.5" />
            New chat
          </button>
          <button
            onClick={handleSignUp}
            className="h-8 px-3 rounded-full text-xs font-semibold text-primary-foreground bg-primary hover:bg-primary/90 transition-colors flex items-center gap-1.5"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Sign up
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-hide py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <img src="/arc-logo-ui.png" alt="" className="h-14 w-14 mb-4 opacity-90" />
            <h1 className="text-2xl font-semibold mb-2">Chat with Arc</h1>
            <p className="text-sm text-muted-foreground max-w-md">
              No account needed. You get 25 replies a day. Sign up for a free account to save chats,
              use memory, generate images, and more.
            </p>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-foreground/5 text-foreground",
                )}
              >
                {m.content || (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-current animate-pulse"
                      style={{ animationDelay: "150ms" }}
                    />
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-current animate-pulse"
                      style={{ animationDelay: "300ms" }}
                    />
                  </span>
                )}
                {m.sources && m.sources.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-foreground/10 space-y-1">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Sources
                    </div>
                    {m.sources.map((s, i) => (
                      <a
                        key={i}
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs text-primary hover:underline truncate"
                      >
                        <ExternalLink className="h-3 w-3 shrink-0" />
                        <span className="truncate">{s.title}</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Input */}
      <div className="shrink-0 pb-4 pt-2" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}>
        <div className="glass-dock flex items-end gap-2">
          <button
            onClick={() => setSearchOn((v) => !v)}
            disabled={sending}
            className={cn(
              "shrink-0 h-8 w-8 rounded-full flex items-center justify-center transition-colors self-center",
              searchOn
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-foreground/10",
            )}
            aria-label="Toggle web search"
            title={searchOn ? "Web search: on" : "Web search: off"}
          >
            <Globe className="h-4 w-4" />
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              limitHit
                ? "Sign up to keep chatting…"
                : sending
                ? "Thinking..."
                : "Message Arc..."
            }
            disabled={sending || limitHit}
            className="flex-1 min-h-[18px] max-h-[200px] border-0 bg-transparent py-0 pr-2 focus-visible:ring-0 focus:outline-none resize-none text-base placeholder:text-muted-foreground/60 scrollbar-hide"
            rows={1}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending || limitHit}
            className="shrink-0 h-8 w-8 rounded-full flex items-center justify-center bg-primary text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-opacity self-center"
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <div className="text-center text-[10px] text-muted-foreground mt-2 px-4">
          Anonymous chats aren't saved. Sign up to save history, use memory, generate images, and more.
        </div>
      </div>

      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}
