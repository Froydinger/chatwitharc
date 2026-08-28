import { Wrench, ShieldAlert, Clock } from "lucide-react";
import { ThemedLogo } from "@/components/ThemedLogo";

export function MaintenanceGuard({ children }: { children: React.ReactNode }) {
  // MAINTENANCE MODE IS ACTIVE (12-hour hold)
  const isMaintenanceMode = true;

  if (isMaintenanceMode) {
    return (
      <div className="fixed inset-0 z-[999999] flex flex-col items-center justify-center bg-background/95 p-6 backdrop-blur-3xl">
        <div className="relative flex max-w-md flex-col items-center text-center glass-card p-8 rounded-3xl border border-primary/30 shadow-2xl animate-fade-in">
          {/* Ambient Glow */}
          <div className="absolute -inset-4 -z-10 rounded-full bg-primary/20 blur-3xl" />

          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20">
            <ThemedLogo className="h-12 w-12" />
          </div>

          <div className="mb-3 flex items-center gap-2 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-500 border border-amber-500/30">
            <Wrench className="h-3.5 w-3.5" />
            Scheduled Maintenance
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Arc is Under Maintenance
          </h1>

          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            We are performing essential system updates and infrastructure maintenance. All AI services and API access are temporarily halted for 12 hours.
          </p>

          <div className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-muted/50 p-3 text-xs text-muted-foreground border border-border/40">
            <Clock className="h-4 w-4 text-primary" />
            <span>Estimated Uptime: Back online in 12 hours</span>
          </div>

          <div className="mt-6 text-[11px] text-muted-foreground/60 flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5" />
            <span>API calls and background sync are currently paused.</span>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
