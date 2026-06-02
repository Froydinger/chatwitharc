import { Bell, Mail, Check, AlertCircle, ExternalLink } from "lucide-react";

export interface NotificationDispatchData {
  channel: "push" | "email" | "both";
  title: string;
  body: string;
  url?: string;
  results: string[];
  sent_at: string;
}

export function NotificationDispatchCard({ dispatch }: { dispatch: NotificationDispatchData }) {
  const hasFail = dispatch.results.some((r) => r.includes("failed"));
  const channelLabel =
    dispatch.channel === "both" ? "Push + Email" : dispatch.channel === "push" ? "Push" : "Email";
  const Icon = dispatch.channel === "email" ? Mail : Bell;

  return (
    <div className="glass-dock rounded-2xl p-4 max-w-md flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <div className={`rounded-xl p-2 shrink-0 ${hasFail ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary"}`}>
          {hasFail ? <AlertCircle className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="font-semibold text-sm truncate">{dispatch.title}</div>
            {!hasFail && <Check className="h-3 w-3 text-primary shrink-0" />}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">
            Sent via {channelLabel}
          </div>
          {dispatch.body && (
            <div className="text-xs text-muted-foreground/90 mt-1.5 line-clamp-3">{dispatch.body}</div>
          )}
        </div>
      </div>
      {dispatch.url && (
        <a
          href={dispatch.url}
          target={dispatch.url.startsWith("http") ? "_blank" : undefined}
          rel="noreferrer"
          className="text-xs text-primary hover:underline flex items-center gap-1 self-start"
        >
          <ExternalLink className="h-3 w-3" /> {dispatch.url}
        </a>
      )}
    </div>
  );
}
