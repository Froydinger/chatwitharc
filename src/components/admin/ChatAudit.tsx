import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { RefreshCw, Search, MessagesSquare, AlertTriangle, X } from "lucide-react";

interface SessionMeta {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string | null;
  updated_at: string | null;
  folder_id: string | null;
}

interface OpenSession extends SessionMeta {
  messages: unknown;
  canvas_content: string | null;
}

export function ChatAudit() {
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [displayNames, setDisplayNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<OpenSession | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    try {
      const { data: res, error: fnErr } = await supabase.functions.invoke("admin-chats", {
        body: { action: "list" },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (res?.error) throw new Error(res.error);
      setSessions(res.sessions ?? []);
      setDisplayNames(res.displayNames ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openSession = async (id: string) => {
    if (!supabase) return;
    setOpening(id);
    setError(null);
    try {
      const { data: res, error: fnErr } = await supabase.functions.invoke("admin-chats", {
        body: { action: "session", sessionId: id },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (res?.error) throw new Error(res.error);
      setOpen(res.session as OpenSession);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOpening(null);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter(
      (s) =>
        (s.title ?? "").toLowerCase().includes(q) ||
        s.user_id.toLowerCase().includes(q) ||
        (displayNames[s.user_id] ?? "").toLowerCase().includes(q),
    );
  }, [sessions, query, displayNames]);

  const byUser = useMemo(() => {
    const map = new Map<string, SessionMeta[]>();
    for (const s of filtered) {
      const list = map.get(s.user_id) ?? [];
      list.push(s);
      map.set(s.user_id, list);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

  const messageList = useMemo(() => {
    if (!open) return [];
    const raw = open.messages;
    if (!Array.isArray(raw)) return [];
    return raw as { role?: string; content?: unknown; type?: string }[];
  }, [open]);

  return (
    <div className="space-y-6 animate-fade-in">
      <Card className="border-border/60">
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MessagesSquare className="h-4 w-4 text-primary" />
                Chat Audit
              </CardTitle>
              <CardDescription>
                Every conversation grouped by account. The list is metadata only — titles and
                dates. Message content is fetched one conversation at a time and each read is
                logged with your admin id.
              </CardDescription>
            </div>
            <Button variant="outline" onClick={load} disabled={loading} className="gap-2 shrink-0">
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl border border-destructive/40 bg-destructive/10 text-sm">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <span className="text-destructive">{error}</span>
            </div>
          )}

          <div className="flex flex-wrap gap-3 text-xs">
            <Badge variant="outline">{sessions.length} chats</Badge>
            <Badge variant="outline">
              {new Set(sessions.map((s) => s.user_id)).size} accounts
            </Badge>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by title, user id or display name..."
              className="pl-9"
            />
          </div>

          {loading && !sessions.length && (
            <p className="text-sm text-muted-foreground py-8 text-center">Reading chats…</p>
          )}

          <div className="space-y-4">
            {byUser.map(([userId, list]) => (
              <div key={userId} className="rounded-2xl border border-border/40 bg-muted/10 p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">
                      {displayNames[userId] || userId}
                    </div>
                    {displayNames[userId] && (
                      <div className="text-[10px] text-muted-foreground font-mono truncate">
                        {userId}
                      </div>
                    )}
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {list.length} chats
                  </Badge>
                </div>

                <div className="space-y-1.5">
                  {list.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => openSession(s.id)}
                      disabled={opening === s.id}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl border border-border/30 bg-background/40 hover:bg-muted/20 transition-colors text-left"
                    >
                      <span className="text-xs truncate flex-1 min-w-0">
                        {s.title || <span className="text-muted-foreground">Untitled</span>}
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {s.updated_at ? new Date(s.updated_at).toLocaleDateString() : "—"}
                        {opening === s.id ? " · opening…" : ""}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Conversation viewer */}
      {open && (
        <div className="fixed inset-0 z-[500] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-[min(760px,100%)] max-h-[85vh] rounded-3xl border border-border/50 bg-background shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-start justify-between gap-3 p-4 border-b border-border/40">
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{open.title || "Untitled"}</div>
                <div className="text-[10px] text-muted-foreground font-mono truncate">
                  {displayNames[open.user_id] || open.user_id} · {messageList.length} messages
                </div>
              </div>
              <button
                onClick={() => setOpen(null)}
                className="p-1.5 rounded-full hover:bg-muted/40 shrink-0"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-4 space-y-3">
              {messageList.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    "rounded-2xl px-3 py-2 text-xs whitespace-pre-wrap break-words",
                    m.role === "user"
                      ? "bg-primary/10 border border-primary/20 ml-8"
                      : "bg-muted/20 border border-border/30 mr-8",
                  )}
                >
                  <div className="text-[9px] uppercase tracking-wide text-muted-foreground mb-1">
                    {m.role ?? "unknown"}
                  </div>
                  {typeof m.content === "string" ? m.content : JSON.stringify(m.content, null, 2)}
                </div>
              ))}
              {!messageList.length && (
                <p className="text-xs text-muted-foreground text-center py-8">
                  No readable messages on this session.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
