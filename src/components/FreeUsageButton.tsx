import * as Dialog from '@radix-ui/react-dialog';
import { CircleGauge, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { PlanUsageBreakdown } from '@/components/PlanUsageBreakdown';

export function FreeUsageButton() {
  const { user, loading: authLoading } = useAuth();
  const { hasBoost, isAdmin, loading } = useSubscription();
  if (!user || authLoading || loading || hasBoost || isAdmin) return null;

  return <Dialog.Root>
    <Dialog.Trigger asChild>
      <button type="button" aria-label="View usage" title="View usage"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/50 bg-muted/25 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <CircleGauge className="h-4 w-4" aria-hidden="true" />
      </button>
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[9998] bg-black/45 backdrop-blur-sm" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-[9999] w-[min(calc(100vw-24px),440px)] max-h-[calc(100dvh-24px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[28px] border border-border/60 bg-background p-4 text-foreground shadow-2xl outline-none sm:p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <Dialog.Title className="text-lg font-semibold">Your usage</Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-muted-foreground">GPT 6 Luna is free and unlimited. Sol uses your shared allowance.</Dialog.Description>
          </div>
          <Dialog.Close aria-label="Close usage" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/50 hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary">
            <X className="h-4 w-4" aria-hidden="true" />
          </Dialog.Close>
        </div>
        <PlanUsageBreakdown />
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
