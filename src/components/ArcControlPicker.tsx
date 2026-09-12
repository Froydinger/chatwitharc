import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Check, ChevronDown, Crown } from 'lucide-react';
import { useState } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useSubscription } from '@/hooks/useSubscription';
import { useModelStore, type LunaReasoningSelection } from '@/store/useModelStore';
import { VoiceMagneticPicker } from '@/components/VoiceMagneticPicker';
import { PRESETS } from '@/components/ChatModelPicker';
import type { VoiceName } from '@/store/useVoiceModeStore';
import { cn } from '@/lib/utils';

type ArcControlPickerProps = {
  name: string;
  selectedVoice: VoiceName;
  onSelectVoice: (voice: VoiceName) => void;
};

/** The input's voice button is the home for both per-request voice and model controls. */
export function ArcControlPicker({ name, selectedVoice, onSelectVoice }: ArcControlPickerProps) {
  const mobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'voice' | 'model'>('voice');
  const reasoningEffort = useModelStore((state) => state.reasoningEffort);
  const setReasoningEffort = useModelStore((state) => state.setReasoningEffort);
  const { hasBoost, isAdmin, dailyBalancedUsed, dailyDeepUsed, FREE_DAILY_BALANCED_LIMIT, FREE_DAILY_DEEP_LIMIT } = useSubscription();
  const selectedPreset = PRESETS.find((preset) => preset.effort === reasoningEffort) ?? PRESETS[0];

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          className="flex h-8 max-w-[118px] shrink-0 items-center gap-1 rounded-full border border-border/40 bg-muted/25 px-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          aria-label={`Choose voice or model: ${name}`}
          title="Choose voice or model"
        >
          <span className="truncate">{name}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[9998] bg-black/45 backdrop-blur-sm" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[9999] w-[min(calc(100vw-24px),500px)] max-h-[min(760px,calc(100dvh-24px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[30px] border border-border/60 bg-background text-foreground shadow-2xl outline-none"
        >
          <DialogPrimitive.Title className="sr-only">Choose Arc voice or model</DialogPrimitive.Title>
          <div className="relative p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-base font-semibold tracking-tight">Arc controls</div>
                <div className="mt-0.5 text-xs text-muted-foreground">Choose what this chat uses.</div>
              </div>
              <DialogPrimitive.Close
                aria-label="Close voice and model picker"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border/50 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/70"
              >
                <span aria-hidden="true" className="text-lg leading-none">×</span>
              </DialogPrimitive.Close>
            </div>

            <div
              className="t-tabs arc-mode-tabs mb-4 w-full"
              data-active={tab === 'voice' ? 'ask' : 'auto'}
              role="tablist"
              aria-label="Choose voice or model"
            >
              <span className="t-tabs-pill" aria-hidden="true" />
              <button type="button" className="t-tab" role="tab" aria-selected={tab === 'voice'} onClick={() => setTab('voice')}>Voice</button>
              <button type="button" className="t-tab" role="tab" aria-selected={tab === 'model'} onClick={() => setTab('model')}>Model</button>
            </div>

            {tab === 'voice' ? (
              <div className="rounded-2xl border border-border/40 bg-card/35 px-1 py-1">
                <VoiceMagneticPicker selectedVoice={selectedVoice} onSelect={onSelectVoice} compact={mobile} />
                <p className="pb-2 text-center text-xs text-muted-foreground">Your selected voice is used the next time you start Voice mode.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="px-1 pb-1">
                  <div className="text-sm font-semibold">Luna reasoning</div>
                  <div className="text-xs text-muted-foreground">Luna is the only text model for now.</div>
                </div>
                {PRESETS.map((preset) => {
                  let badge: string | undefined;
                  if (preset.effort === 'low') badge = 'Unlimited';
                  if (preset.effort === 'medium') badge = isAdmin || hasBoost ? 'Unlimited' : `${Math.max(0, FREE_DAILY_BALANCED_LIMIT - dailyBalancedUsed)}/10 left`;
                  if (preset.effort === 'high') badge = isAdmin || hasBoost ? 'Unlimited' : `${Math.max(0, FREE_DAILY_DEEP_LIMIT - dailyDeepUsed)}/3 left`;
                  const Icon = preset.icon;
                  const active = reasoningEffort === preset.effort;
                  return (
                    <button
                      type="button"
                      key={preset.effort}
                      onClick={() => setReasoningEffort(preset.effort as LunaReasoningSelection)}
                      aria-pressed={active}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-colors',
                        active ? 'border-primary/55 bg-primary/12 shadow-[0_0_20px_hsl(var(--primary)/0.16)]' : 'border-border/35 bg-card/30 hover:border-border/70 hover:bg-muted/45',
                      )}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted/70"><Icon className="h-4.5 w-4.5 text-primary" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2"><span className="text-sm font-semibold text-foreground">{preset.title}</span>{badge && <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">{badge}</span>}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{preset.subtitle}</span>
                      </span>
                      {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
                    </button>
                  );
                })}
                {!hasBoost && !isAdmin && <div className="flex items-center gap-2 rounded-2xl border border-primary/20 bg-primary/10 px-3 py-2 text-xs text-muted-foreground"><Crown className="h-4 w-4 shrink-0 text-primary" /><span>Boost unlocks unlimited reasoning.</span></div>}
                <div className="pt-1 text-center text-xs text-muted-foreground">Current: Luna · {selectedPreset.title}</div>
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
