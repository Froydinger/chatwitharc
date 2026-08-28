import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { RefreshCw, Search, HardDrive, Eye, Download, AlertTriangle } from "lucide-react";

interface FileEntry {
  bucket: string;
  userId: string;
  name: string;
  path: string;
  sizeBytes: number | null;
  mimeType: string | null;
  createdAt: string | null;
  kind: "uploaded" | "generated" | "avatar" | "other";
}

interface ListResponse {
  files: FileEntry[];
  displayNames: Record<string, string>;
  userEmails?: Record<string, string>;
  bucketErrors: Record<string, string>;
  totalBytes: number;
}

const KIND_FILTERS = [
  { id: "all", label: "All" },
  { id: "uploaded", label: "Uploaded" },
  { id: "generated", label: "Generated" },
  { id: "avatar", label: "Avatars" },
] as const;

function formatBytes(n: number | null): string {
  if (n === null || Number.isNaN(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function StorageAudit() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<(typeof KIND_FILTERS)[number]["id"]>("all");
  const [previews, setPreviews] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    try {
      const { data: res, error: fnErr } = await supabase.functions.invoke("admin-storage", {
        body: { action: "list" },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (res?.error) throw new Error(res.error);
      setData(res as ListResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.files.filter((f) => {
      if (kind !== "all" && f.kind !== kind) return false;
      if (!q) return true;
      const email = data.userEmails?.[f.userId] ?? "";
      const name = data.displayNames?.[f.userId] ?? "";
      return (
        f.name.toLowerCase().includes(q) ||
        f.userId.toLowerCase().includes(q) ||
        email.toLowerCase().includes(q) ||
        name.toLowerCase().includes(q)
      );
    });
  }, [data, query, kind]);

  /** Group by user so the audit reads per person across all registered accounts. */
  const byUser = useMemo(() => {
    const map = new Map<string, FileEntry[]>();
    if (data?.userEmails) {
      for (const userId of Object.keys(data.userEmails)) {
        if (userId !== "(root)") {
          map.set(userId, []);
        }
      }
    }
    for (const f of filtered) {
      const list = map.get(f.userId) ?? [];
      list.push(f);
      map.set(f.userId, list);
    }
    const q = query.trim().toLowerCase();
    return [...map.entries()]
      .filter(([userId, files]) => {
        if (kind !== "all" && files.length > 0 && !files.some(f => f.kind === kind)) return false;
        if (!q) return true;
        const email = data?.userEmails?.[userId] ?? "";
        const name = data?.displayNames?.[userId] ?? "";
        return (
          userId.toLowerCase().includes(q) ||
          email.toLowerCase().includes(q) ||
          name.toLowerCase().includes(q) ||
          files.some(f => f.name.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => b[1].length - a[1].length);
  }, [filtered, data, kind, query]);

  const signFor = useCallback(async (bucket: string, paths: string[]) => {
    if (!supabase || !paths.length) return;
    try {
      const { data: res, error: fnErr } = await supabase.functions.invoke("admin-storage", {
        body: { action: "sign", bucket, paths },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (res?.error) throw new Error(res.error);
      const next: Record<string, string> = {};
      for (const u of res.urls ?? []) {
        if (u.signedUrl && u.path) next[`${bucket}/${u.path}`] = u.signedUrl;
      }
      setPreviews((p) => ({ ...p, ...next }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Auto-generate signed URLs for non-avatar buckets as files load
  useEffect(() => {
    if (!data?.files.length) return;
    const pathsByBucket: Record<string, string[]> = {};
    for (const f of data.files) {
      if (f.bucket !== 'avatars' && !previews[`${f.bucket}/${f.path}`]) {
        if (!pathsByBucket[f.bucket]) pathsByBucket[f.bucket] = [];
        pathsByBucket[f.bucket].push(f.path);
      }
    }
    for (const [b, paths] of Object.entries(pathsByBucket)) {
      if (paths.length > 0) void signFor(b, paths);
    }
  }, [data, signFor, previews]);

  const totalRegisteredAccounts = useMemo(() => {
    return Object.keys(data?.userEmails || {}).length || new Set(data?.files.map((f) => f.userId)).size;
  }, [data]);

  return (
    <div className="space-y-6 animate-fade-in">
      <Card className="border-border/60">
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-primary" />
                Storage Audit
              </CardTitle>
              <CardDescription>
                Every file users have uploaded or generated, grouped by account. Listing runs
                server-side under the service role, because storage RLS stops even an admin
                session from reading another user&apos;s folder from the browser.
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

          {data && (
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <Badge variant="outline">{data.files.length} files</Badge>
              <Badge variant="outline">{formatBytes(data.totalBytes)} total</Badge>
              <Badge variant="outline">
                {totalRegisteredAccounts} accounts ({new Set(data.files.map((f) => f.userId)).size} with files)
              </Badge>
              {Object.entries(data.bucketErrors ?? {}).map(([b, msg]) => (
                <Badge key={b} variant="outline" className="border-destructive/40 text-destructive">
                  {b}: {msg}
                </Badge>
              ))}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by filename, user email, name or ID..."
                className="pl-9"
              />
            </div>
            <div className="flex gap-1.5">
              {KIND_FILTERS.map((k) => (
                <Button
                  key={k.id}
                  variant={kind === k.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setKind(k.id)}
                >
                  {k.label}
                </Button>
              ))}
            </div>
          </div>

          {loading && !data && (
            <p className="text-sm text-muted-foreground py-8 text-center">Reading storage…</p>
          )}

          {data && !filtered.length && (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No files match this filter.
            </p>
          )}

          <div className="space-y-4">
            {byUser.map(([userId, files]) => {
              const email = data?.userEmails?.[userId];
              const name = data?.displayNames?.[userId];
              const headerTitle = email || name || userId;

              return (
                <div key={userId} className="rounded-2xl border border-border/40 bg-muted/10 p-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate flex items-center gap-2">
                        <span className="text-foreground">{headerTitle}</span>
                        {name && email && (
                          <span className="text-xs font-normal text-muted-foreground">
                            ({name})
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground/70 font-mono truncate">
                        ID: {userId}
                      </div>
                    </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-[10px]">
                      {files.length} files ·{" "}
                      {formatBytes(files.reduce((n, f) => n + (f.sizeBytes ?? 0), 0))}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 h-7 text-xs"
                      onClick={() =>
                        signFor(
                          files[0].bucket,
                          files.filter((f) => f.bucket === files[0].bucket).map((f) => f.path),
                        )
                      }
                    >
                      <Eye className="h-3 w-3" />
                      Preview
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                  {files.map((f) => {
                    const publicAvatarUrl = f.bucket === 'avatars' ? `https://jpqtoixhjnfdubvqshwk.supabase.co/storage/v1/object/public/avatars/${f.path}` : null;
                    const url = previews[`${f.bucket}/${f.path}`] || publicAvatarUrl;
                    return (
                      <div
                        key={`${f.bucket}/${f.path}`}
                        className="rounded-xl border border-border/40 bg-background/40 overflow-hidden"
                      >
                        <div className="aspect-square bg-muted/20 flex items-center justify-center overflow-hidden">
                          {url ? (
                            <img
                              src={url}
                              alt={f.name}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <span className="text-[9px] text-muted-foreground px-2 text-center">
                              {f.mimeType ?? "file"}
                            </span>
                          )}
                        </div>
                        <div className="p-1.5 space-y-0.5">
                          <div className="text-[9px] font-mono truncate" title={f.name}>
                            {f.name}
                          </div>
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[9px] text-muted-foreground">
                              {formatBytes(f.sizeBytes)}
                            </span>
                            {url && (
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[9px] text-primary hover:underline flex items-center gap-0.5"
                              >
                                <Download className="h-2.5 w-2.5" />
                                open
                              </a>
                            )}
                          </div>
                          <div className="text-[9px] text-muted-foreground">
                            {f.createdAt ? new Date(f.createdAt).toLocaleDateString() : "—"} ·{" "}
                            {f.bucket}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          </div>

          <p className="text-[10px] text-muted-foreground pt-2">
            Preview links are signed and expire after 5 minutes, so a URL pasted somewhere by
            accident stops working rather than exposing an upload indefinitely.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
