import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, RefreshCcwDot, Scale, Brain, Check, ChevronDown, Crown } from 'lucide-react';
import { useModelStore, type LunaReasoningSelection } from '@/store/useModelStore';
import { useSubscription } from '@/hooks/useSubscription';
import { cn } from '@/lib/utils';

interface Props {
  className?: string;
  compact?: boolean;
  /** Kept for backwards compatibility; the dropdown auto-anchors below the button. */
  placement?: 'up' | 'down';
}

const PRESETS = [
  { effort: 'auto', title: 'Auto', subtitle: 'Quick first, more reasoning when needed', icon: RefreshCcwDot },
  { effort: 'low', title: 'Quick', subtitle: 'Faster everyday answers', icon: Zap },
  { effort: 'medium', title: 'Balanced', subtitle: 'A balance of speed and reasoning', icon: Scale },
  { effort: 'high', title: 'Deep', subtitle: 'More reasoning for harder work', icon: Brain },
] as const;

export function ChatModelPicker({ className, compact = false }: Props) {
  const {
    hasBoost,
    isAdmin,
    openCheckout,
    dailyBalancedUsed,
    dailyDeepUsed,
    FREE_DAILY_BALANCED_LIMIT,
    FREE_DAILY_DEEP_LIMIT,
  } = useSubscription();
  const reasoningEffort = useModelStore((state) => state.reasoningEffort);
  const setReasoningEffort = useModelStore((state) => state.setReasoningEffort);
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const activePreset = PRESETS.find((preset) => preset.effort === reasoningEffort) ?? PRESETS[0];
  const CurrentIcon = activePreset.icon;

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
      setCoords({ top: rect.bottom + 6, left });
    };
    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, true);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
    };
  }, [open]);

  const pick = (effort: LunaReasoningSelection) => {
    setReasoningEffort(effort);
    setOpen(false);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'glass-btn inline-flex items-center gap-1.5 h-10 rounded-full text-sm font-semibold text-foreground/90',
          compact ? 'px-3' : 'px-4',
          className,
        )}
        aria-label={`Luna reasoning: ${activePreset.title}`}
        title={`Luna · ${activePreset.title} — tap to change reasoning level`}
      >
        <CurrentIcon className="h-4 w-4 text-primary" />
        <span>{compact ? activePreset.title : `Luna · ${activePreset.title}`}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 opacity-60 transition-transform', open && 'rotate-180')} />
      </button>

      {createPortal(
        <AnimatePresence>
          {open && coords && (
            <>
              <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 380, damping: 26 }}
                style={{ top: coords.top, left: coords.left }}
                className="fixed z-[9999] w-[17rem] rounded-2xl border border-border/40 glass shadow-2xl p-1.5"
              >
                <div className="px-2.5 pt-2 pb-1.5">
                  <div className="text-xs font-semibold">Luna is the only model for now</div>
                  <div className="text-[10px] text-muted-foreground">Choose how much reasoning Luna uses.</div>
                </div>
                {PRESETS.map((preset) => {
                  let badge: string | undefined;
                  if (preset.effort === 'low') {
                    badge = 'Unlimited';
                  } else if (preset.effort === 'medium') {
                    badge = isAdmin || hasBoost ? 'Unlimited' : `${Math.max(0, FREE_DAILY_BALANCED_LIMIT - dailyBalancedUsed)}/10 left`;
                  } else if (preset.effort === 'high') {
                    badge = isAdmin || hasBoost ? 'Unlimited' : `${Math.max(0, FREE_DAILY_DEEP_LIMIT - dailyDeepUsed)}/3 left`;
                  }
                  return (
                    <Row
                      key={preset.effort}
                      icon={<preset.icon className="h-4 w-4 text-primary" />}
                      title={preset.title}
                      subtitle={preset.subtitle}
                      badge={badge}
                      active={reasoningEffort === preset.effort}
                      onClick={() => pick(preset.effort)}
                    />
                  );
                })}
                {!hasBoost && !isAdmin && (
                  <div className="mt-1 pt-1.5 border-t border-border/40">
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        openCheckout();
                      }}
                      className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl bg-primary/10 hover:bg-primary/15 border border-primary/20 text-left transition-colors group cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Crown className="h-3.5 w-3.5 text-primary shrink-0" />
                        <div className="text-[11px] font-medium text-foreground">
                          Upgrade to <span className="font-semibold text-primary">Boost</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-medium text-primary group-hover:translate-x-0.5 transition-transform">
                        Higher limits →
                      </span>
                    </button>
                  </div>
                )}
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}

function Row({ icon, title, subtitle, badge, active, onClick }: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  badge?: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition-colors',
        active ? 'bg-primary/15' : 'hover:bg-white/5',
      )}
    >
      <div className="w-7 h-7 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold">{title}</span>
          {badge && (
            <span
              className={cn(
                'text-[9px] font-mono px-1.5 py-0.5 rounded-md leading-none',
                badge === 'Unlimited'
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'bg-muted/80 text-muted-foreground font-medium',
              )}
            >
              {badge}
            </span>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground truncate">{subtitle}</div>
      </div>
      {active && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
    </button>
  );
}
