import { useEffect } from 'react';
import { Crown, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSubscription } from '@/hooks/useSubscription';
import { useExecutionModelStore } from '@/store/useExecutionModelStore';

interface AppBuilderModelChoiceProps {
  ownerId: string | null;
  disabled?: boolean;
}

export function AppBuilderModelChoice({ ownerId, disabled = false }: AppBuilderModelChoiceProps) {
  const { hasBoost, isAdmin, loading: subscriptionLoading } = useSubscription();
  const canUsePro = hasBoost || isAdmin;
  const executionOwnerId = useExecutionModelStore((state) => state.ownerId);
  const appModelMode = useExecutionModelStore((state) => state.appModelMode);
  const setOwnerId = useExecutionModelStore((state) => state.setOwnerId);
  const setAppModelMode = useExecutionModelStore((state) => state.setAppModelMode);

  useEffect(() => {
    setOwnerId(ownerId);
  }, [ownerId, setOwnerId]);

  useEffect(() => {
    if (executionOwnerId === ownerId && !subscriptionLoading && !canUsePro && appModelMode === 'pro') {
      setAppModelMode(ownerId, 'fast', false);
    }
  }, [appModelMode, canUsePro, executionOwnerId, ownerId, setAppModelMode, subscriptionLoading]);

  const ownerReady = executionOwnerId === ownerId;
  const activeModel = ownerReady && canUsePro ? appModelMode : 'fast';
  const controlsDisabled = disabled || !ownerReady || subscriptionLoading;

  return (
    <div
      role="group"
      aria-label="App Builder model"
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-border/60 bg-background/70 p-0.5"
    >
      <button
        type="button"
        aria-label="Fast model, GPT-6 Luna"
        aria-pressed={activeModel === 'fast'}
        disabled={controlsDisabled}
        onClick={() => setAppModelMode(ownerId, 'fast', canUsePro)}
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-50',
          activeModel === 'fast' ? 'bg-foreground text-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
        )}
        title="Fast · GPT-6 Luna"
      >
        <Zap className="h-3 w-3" aria-hidden="true" />
        Fast
      </button>
      <button
        type="button"
        aria-label={canUsePro ? 'Pro model, GPT-6.1 Sol' : 'Pro model requires Boost'}
        aria-pressed={activeModel === 'pro'}
        disabled={controlsDisabled || !canUsePro}
        onClick={() => setAppModelMode(ownerId, 'pro', canUsePro)}
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-50',
          activeModel === 'pro' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
        )}
        title={canUsePro ? 'Pro · GPT-6.1 Sol' : 'Pro model requires Boost or admin access'}
      >
        <Crown className="h-3 w-3" aria-hidden="true" />
        Pro
      </button>
    </div>
  );
}
