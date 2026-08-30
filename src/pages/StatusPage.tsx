import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowLeft, CheckCircle2, CircleAlert, Clock3, RefreshCw, ShieldCheck, WifiOff } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ServiceState = "operational" | "degraded" | "outage";

interface ServiceHealth {
  id: string;
  name: string;
  status: ServiceState;
  latencyMs?: number;
  detail: string;
}

interface HealthResponse {
  overall: ServiceState;
  checkedAt: string;
  services: ServiceHealth[];
}

const stateCopy = {
  operational: { label: "All systems operational", color: "text-emerald-400", bg: "bg-emerald-400", Icon: CheckCircle2 },
  degraded: { label: "Some systems are degraded", color: "text-amber-400", bg: "bg-amber-400", Icon: CircleAlert },
  outage: { label: "Service interruption", color: "text-red-400", bg: "bg-red-400", Icon: WifiOff },
} as const;

export function StatusPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: invokeError } = await supabase.functions.invoke("system-health", { body: { action: "health" } });
    if (invokeError || !data?.services) {
      setError("The status service could not be reached.");
      setHealth(null);
    } else {
      setHealth(data as HealthResponse);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const overall = error ? "outage" : health?.overall ?? "operational";
  const summary = stateCopy[overall];
  const SummaryIcon = summary.Icon;

  return (
    <main className="relative z-10 min-h-screen px-4 py-6 text-foreground sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-10 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to Arc
          </Link>
          <Button variant="outline" size="sm" className="rounded-full gap-2" onClick={refresh} disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
          </Button>
        </header>

        <section className="relative overflow-hidden rounded-[2.25rem] border border-border/40 bg-background/50 p-6 shadow-[0_30px_100px_-60px_hsl(var(--primary)/0.8)] backdrop-blur-2xl sm:p-10">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative">
            <div className="mb-10 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
              <div>
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
                  <Activity className="h-3.5 w-3.5" /> ArcAI system status
                </div>
                <h1 className="max-w-2xl text-4xl font-light tracking-tight sm:text-6xl">The live pulse of Arc.</h1>
                <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">Real checks across the services that power chat, creative tools, reminders, and your saved work.</p>
              </div>
              <div className={cn("flex items-center gap-2 text-sm font-semibold", summary.color)}>
                <span className={cn("h-2.5 w-2.5 rounded-full shadow-[0_0_18px_currentColor]", summary.bg)} />
                {loading && !health ? "Checking systems…" : summary.label}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {(health?.services ?? []).map((service, index) => {
                const visual = stateCopy[service.status];
                const Icon = visual.Icon;
                return (
                  <motion.article key={service.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} className="rounded-3xl border border-border/35 bg-background/45 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <span className={cn("flex h-10 w-10 items-center justify-center rounded-2xl bg-muted/25", visual.color)}><Icon className="h-5 w-5" /></span>
                        <div><h2 className="text-sm font-semibold">{service.name}</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{service.detail}</p></div>
                      </div>
                      <span className={cn("text-[10px] font-semibold uppercase tracking-wider", visual.color)}>{service.status}</span>
                    </div>
                    {typeof service.latencyMs === "number" && <div className="mt-4 flex items-center gap-1.5 text-[11px] text-muted-foreground"><Clock3 className="h-3.5 w-3.5" /> {service.latencyMs} ms</div>}
                  </motion.article>
                );
              })}
            </div>

            {error && <div className="rounded-3xl border border-red-500/25 bg-red-500/5 p-5 text-sm text-red-300">{error} This is reported as an interruption rather than guessing that everything is fine.</div>}
            {loading && !health && !error && <div className="grid gap-3 sm:grid-cols-2">{[0,1,2,3].map((item) => <div key={item} className="h-32 animate-pulse rounded-3xl border border-border/30 bg-muted/15" />)}</div>}

            <footer className="mt-8 flex flex-col justify-between gap-3 border-t border-border/35 pt-5 text-xs text-muted-foreground sm:flex-row sm:items-center">
              <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> Privacy-safe aggregate traffic only. No visitor tracking.</span>
              {health?.checkedAt && <span>Last checked {new Date(health.checkedAt).toLocaleString()}</span>}
            </footer>
          </div>
        </section>
      </div>
    </main>
  );
}
