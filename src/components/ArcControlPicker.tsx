import { BoostIcon } from '@/components/BoostIcon';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Check, ChevronDown, Lock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useSubscription } from '@/hooks/useSubscription';
import { ASTRA_MODEL, canSelectAstra, useModelStore } from '@/store/useModelStore';
import { useAuth } from '@/hooks/useAuth';
import { VoiceMagneticPicker } from '@/components/VoiceMagneticPicker';
import { PRESETS } from '@/components/ChatModelPicker';
import type { VoiceName } from '@/store/useVoiceModeStore';
import { cn } from '@/lib/utils';
import { FreeUsageButton } from '@/components/FreeUsageButton';
import { useWorkspaceUI } from '@/workspace/WorkspaceContext';

type ArcControlPickerProps = {
  name: string;
  selectedVoice: VoiceName;
  onSelectVoice: (voice: VoiceName) => void;
};

/** The input's voice button is the home for both per-request voice and model controls. */
export function ArcControlPicker({ name, selectedVoice, onSelectVoice }: ArcControlPickerProps) {
  const workspaceUI = useWorkspaceUI();
  const mobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'model' | 'voice'>('model');
  const modelSelection = useModelStore((state) => state.modelSelection);
  const { user, loading: authLoading } = useAuth();
  const presets = PRESETS;
  const setModelSelection = useModelStore((state) => state.setModelSelection);
  const { hasVerifiedBoost, isVerifiedModelAdmin: isAdmin, loading: subscriptionLoading, openCheckout } = useSubscription();
  const astraAvailable = canSelectAstra(hasVerifiedBoost, isAdmin, authLoading || subscriptionLoading) && Boolean(user?.id && !user.is_anonymous);
  const selectedPreset = presets.find((preset) => preset.selection === modelSelection) ?? presets[0];

  useEffect(() => {
    if (!authLoading && !subscriptionLoading && modelSelection === ASTRA_MODEL && !astraAvailable) setModelSelection('auto');
  }, [authLoading, subscriptionLoading, modelSelection, astraAvailable, setModelSelection]);

  return (
    <>
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) setTab('model');
      }}
    >
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          className="flex h-8 max-w-[118px] shrink-0 items-center gap-1 rounded-full border border-border/40 bg-muted/25 px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          aria-label={`Choose model or voice: ${selectedPreset.title}`}
          title="Choose model or voice"
        >
          <span className="truncate">{selectedPreset.title}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={cn('fixed inset-0 z-[9998] bg-black/45 backdrop-blur-sm', workspaceUI && 'ws-flat-overlay')} />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn('fixed left-1/2 top-1/2 z-[9999] w-[min(calc(100vw-24px),500px)] max-h-[min(760px,calc(100dvh-24px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[30px] border border-border/60 bg-background text-foreground shadow-2xl outline-none', workspaceUI && 'workspace-ui ws-flat-dialog ws-model-voice-dialog')}
        >
          <DialogPrimitive.Title className="sr-only">Choose Arc model or voice</DialogPrimitive.Title>
          <div className="relative p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-base font-semibold tracking-tight">Arc controls</div>
                <div className="mt-0.5 text-xs text-muted-foreground">Choose what this chat uses.</div>
              </div>
              <DialogPrimitive.Close
                aria-label="Close model and voice picker"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border/50 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/70"
              >
                <span aria-hidden="true" className="text-lg leading-none">×</span>
              </DialogPrimitive.Close>
            </div>

            <div
              className="t-tabs arc-mode-tabs mb-4 w-full"
              data-active={tab === 'voice' ? 'auto' : 'ask'}
              role="tablist"
              aria-label="Choose model or voice"
            >
              <span className="t-tabs-pill" aria-hidden="true" />
              <button
                type="button"
                className="t-tab"
                role="tab"
                aria-selected={tab === 'model'}
                aria-pressed={tab === 'model'}
                onClick={() => setTab('model')}
              >
                Model
              </button>
              <button
                type="button"
                className="t-tab"
                role="tab"
                aria-selected={tab === 'voice'}
                aria-pressed={tab === 'voice'}
                onClick={() => setTab('voice')}
              >
                Voice
              </button>
            </div>

            {tab === 'model' ? (
              <div className="space-y-2">
                <div className="px-1 pb-1">
                  <div className="text-sm font-semibold">Arc Matrix™</div>
                  <div className="text-xs text-muted-foreground">Choose how Arc responds.</div>
                </div>
                {presets.map((preset) => {
                  const locked = preset.selection === ASTRA_MODEL && !astraAvailable;
                  const disabled = locked && (authLoading || subscriptionLoading);
                  const badge = preset.selection === ASTRA_MODEL ? 'Boost' : preset.selection === 'gpt-6-luna' ? 'Unlimited' : undefined;
                  const Icon = preset.icon;
                  const active = !locked && modelSelection === preset.selection;
                  return (
                    <button
                      type="button"
                      key={preset.selection}
                      onClick={() => {
                        if (disabled) return;
                        if (locked) { setOpen(false); openCheckout(undefined, 'astra_boost_required'); return; }
                        setModelSelection(preset.selection);
                      }}
                      disabled={disabled}
                      aria-pressed={active}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-colors',
                        disabled ? 'cursor-not-allowed border-border/25 bg-card/20 opacity-55' : active ? 'border-primary/55 bg-primary/12 shadow-[0_0_20px_hsl(var(--primary)/0.16)]' : 'border-border/35 bg-card/30 hover:border-border/70 hover:bg-muted/45',
                      )}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted/70"><Icon className="h-4.5 w-4.5 text-primary" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2"><span className="text-sm font-semibold text-foreground">{preset.title}</span>{badge && <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">{badge === 'Boost' && locked && <BoostIcon hasBoost={false} className="h-3.5 w-3.5 shrink-0" />}{badge}</span>}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{preset.subtitle}</span>
                      </span>
                      {locked && <Lock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                      {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
                    </button>
                  );
                })}
                <p className="px-1 text-xs leading-relaxed text-muted-foreground">Auto can use your Sol allowance. When it runs out, Auto and Sol switch to Luna.</p>

                <div className="pt-1 text-center text-xs text-muted-foreground">Current: {selectedPreset.title}</div>
              </div>
            ) : (
              <div className="rounded-2xl border border-border/40 bg-card/35 px-1 py-1">
                <VoiceMagneticPicker selectedVoice={selectedVoice} onSelect={onSelectVoice} compact={mobile} />
                <p className="pb-2 text-center text-xs text-muted-foreground">Your selected voice is used the next time you start Voice mode.</p>
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
    <FreeUsageButton />
    </>
  );
}
