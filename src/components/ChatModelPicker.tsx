import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ConditionalTransition } from '@/components/transitions/ConditionalTransition';
import { BoostIcon } from '@/components/BoostIcon';
import { Lock, Check, ChevronDown } from 'lucide-react';
import { CHAT_MODEL_ICONS } from '@/lib/chatModelIcons';
import { ASTRA_MODEL, canSelectAstra, useModelStore, type ArcModelSelection } from '@/store/useModelStore';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { cn } from '@/lib/utils';

interface Props {
  className?: string;
  compact?: boolean;
  /** Workspace composer opens upward; existing header callers default downward. */
  placement?: 'up' | 'down';
  showArcWork?: boolean;
  arcWorkAvailable?: boolean;
  arcMode?: 'ask' | 'auto';
  onArcModeChange?: (mode: 'ask' | 'auto') => void;
}

export const PRESETS = [
  { selection: 'auto', title: 'Auto', subtitle: 'May use Sol and its shared allowance', icon: CHAT_MODEL_ICONS.auto },
  { selection: 'gpt-6-luna', title: 'GPT 6 Luna', subtitle: 'Free and unlimited for everyone', icon: CHAT_MODEL_ICONS['gpt-6-luna'] },
  { selection: 'gpt-6.1-sol', title: 'GPT 6.1 Sol', subtitle: 'Uses your shared Sol allowance', icon: CHAT_MODEL_ICONS['gpt-6.1-sol'] },
  { selection: 'gpt-6-astra', title: 'GPT 6 Astra', subtitle: 'Boost · separate Astra allowance', icon: CHAT_MODEL_ICONS['gpt-6-astra'] },
] as const;

export function ChatModelPicker({
  className,
  compact = false,
  placement = 'down',
  showArcWork = false,
  arcWorkAvailable = false,
  arcMode = 'ask',
  onArcModeChange,
}: Props) {
  const {
    hasVerifiedBoost,
    isVerifiedModelAdmin: isAdmin,
    loading: subscriptionLoading,
    openCheckout,
  } = useSubscription();
  const modelSelection = useModelStore((state) => state.modelSelection);
  const { user, loading: authLoading } = useAuth();
  const presets = PRESETS;
  const astraAvailable = canSelectAstra(hasVerifiedBoost, isAdmin, authLoading || subscriptionLoading) && Boolean(user?.id && !user.is_anonymous);
  const setModelSelection = useModelStore((state) => state.setModelSelection);
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; bottom?: number; maxHeight?: number } | null>(null);
  const activePreset = presets.find((preset) => preset.selection === modelSelection) ?? presets[0];
  const CurrentIcon = activePreset.icon;

  useEffect(() => {
    if (!authLoading && !subscriptionLoading && modelSelection === ASTRA_MODEL && !astraAvailable) setModelSelection('auto');
  }, [authLoading, subscriptionLoading, modelSelection, astraAvailable, setModelSelection]);

  useEffect(() => {
    if (!open) return;
    const panelWidth = 272;
    const compute = () => {
      const element = btnRef.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const margin = 8;
      let left = rect.left + rect.width / 2 - panelWidth / 2;
      left = Math.max(margin, Math.min(left, window.innerWidth - panelWidth - margin));
      setCoords(placement === 'up'
        ? { top: rect.bottom + 6, left, bottom: Math.max(margin, (window.visualViewport?.height ?? window.innerHeight) - rect.top + 6), maxHeight: Math.max(44, rect.top - margin - 6) }
        : { top: rect.bottom + 6, left });
    };
    compute();
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); btnRef.current?.focus(); }
    };
    window.addEventListener('keydown', dismiss);
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, true);
    return () => {
      window.removeEventListener('keydown', dismiss);
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
    };
  }, [open, placement]);

  const pick = (selection: ArcModelSelection) => {
    if (selection === ASTRA_MODEL && !astraAvailable) {
      if (authLoading || subscriptionLoading) return;
      setOpen(false);
      openCheckout(undefined, 'astra_boost_required');
      return;
    }
    setModelSelection(selection);
    setOpen(false);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'glass-btn inline-flex items-center gap-1.5 h-8 rounded-full text-xs font-semibold text-foreground/90',
          compact ? 'px-2.5' : 'px-3',
          className,
        )}
        aria-expanded={open}
        aria-label={`Arc Matrix model: ${activePreset.title}`}
        title={`Arc · ${activePreset.title} — tap to change model`}
      >
        <CurrentIcon className="h-4 w-4 text-primary" />
        <span>{compact ? activePreset.title : activePreset.title}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 opacity-60 transition-transform', open && 'rotate-180')} />
      </button>

      {createPortal(
        <>
          {open && coords && <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />}
          <ConditionalTransition preset="dropdown">
            {open && coords && (
              <div
                data-testid="chat-model-menu"
                style={placement === 'up'
                  ? { bottom: coords.bottom, left: coords.left, maxHeight: coords.maxHeight, overflowY: 'auto' }
                  : { top: coords.top, left: coords.left }}
                className="fixed z-[9999] w-[17rem] rounded-2xl border border-border/40 glass shadow-2xl p-1.5"
              >
                {showArcWork && (
                  <div className="px-2.5 pt-2 pb-2 border-b border-border/30">
                    <div className="text-xs font-semibold mb-2">Arc mode</div>
                    <div
                      className="t-tabs arc-mode-tabs"
                      data-active={arcMode}
                      role="group"
                      aria-label="Arc Chat or Arc Work mode"
                    >
                      <span className="t-tabs-pill" aria-hidden="true" />
                      <button
                        type="button"
                        className="t-tab"
                        data-mode="ask"
                        aria-pressed={arcMode === 'ask'}
                        onClick={() => onArcModeChange?.('ask')}
                      >
                        Arc Chat
                      </button>
                      <button
                        type="button"
                        className="t-tab"
                        data-mode="auto"
                        aria-pressed={arcMode === 'auto'}
                        title={arcWorkAvailable ? 'Arc Work' : 'Arc Work requires Boost'}
                        onClick={() => {
                          if (!arcWorkAvailable) {
                            setOpen(false);
                            openCheckout();
                            return;
                          }
                          onArcModeChange?.('auto');
                        }}
                      >
                        Arc Work
                        <BoostIcon hasBoost={hasVerifiedBoost || isAdmin} className="h-3 w-3 ml-1 text-primary shrink-0" />
                      </button>
                    </div>
                  </div>
                )}
                {presets.map((preset) => {
                  const locked = preset.selection === ASTRA_MODEL && !astraAvailable;
                  const disabled = locked && (authLoading || subscriptionLoading);
                  const badge = preset.selection === ASTRA_MODEL
                    ? 'Boost'
                    : preset.selection === 'gpt-6-luna'
                    ? 'Unlimited'
                    : preset.selection === 'gpt-6.1-sol'
                    ? 'Allowance'
                    : undefined;
                  return (
                    <Row
                      key={preset.selection}
                      icon={<preset.icon className="h-4 w-4 text-primary" />}
                      title={preset.title}
                      badge={badge}
                      active={!locked && modelSelection === preset.selection}
                      disabled={disabled}
                      locked={locked}
                      onClick={() => pick(preset.selection)}
                    />
                  );
                })}
              </div>
            )}
          </ConditionalTransition>
        </>,
        document.body,
      )}
    </>
  );
}

function Row({ icon, title, badge, active, disabled, locked, onClick }: {
  icon: React.ReactNode;
  title: string;
  badge?: string;
  active?: boolean;
  disabled?: boolean;
  locked?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      title={locked ? 'Available with Boost' : undefined}
      className={cn(
        'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition-colors',
        disabled ? 'cursor-not-allowed opacity-55' : active ? 'bg-primary/15' : 'hover:bg-white/5',
      )}
    >
      <div className="w-7 h-7 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold">{title}</span>
          {badge && (
            <span
              className={cn(
                'inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded-md leading-none',
                badge === 'Unlimited' ? 'bg-primary/10 text-primary font-medium' : 'bg-muted/80 text-muted-foreground font-medium',
              )}
            >
              {badge === 'Boost' && <BoostIcon hasBoost={false} className="h-3 w-3 shrink-0" />}
              {badge}
            </span>
          )}
        </div>
      </div>
      {locked && <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />}
      {active && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
    </button>
  );
}
