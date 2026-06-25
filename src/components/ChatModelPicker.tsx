import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Brain, Lock, Check, ChevronDown } from 'lucide-react';
import { useModelStore, FASTER_MODEL, SMARTER_MODEL, type ChatModel } from '@/store/useModelStore';
import { cn } from '@/lib/utils';

// Restore point marker — safe rebuild checkpoint
interface Props {
  className?: string;
  compact?: boolean;
  /** kept for backwards compat — dropdown is portaled and auto-anchors below button */
  placement?: 'up' | 'down';
}

/** Faster (5.4-nano) vs Smarter (5.4-mini) picker. Smarter is Boost-only. */
export function ChatModelPicker({ className }: Props) {
  const chatModel = useModelStore((s) => s.chatModel);
  const setChatModel = useModelStore((s) => s.setChatModel);
  const isBoost = useModelStore((s) => s.isBoost);
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const current = chatModel === SMARTER_MODEL ? 'Smarter' : 'Faster';
  const CurrentIcon = chatModel === SMARTER_MODEL ? Brain : Zap;

  // Compute position when opening, and on resize/scroll while open.
  useEffect(() => {
    if (!open) return;
    const PANEL_W = 240; // matches w-60
    const compute = () => {
      const el = btnRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const margin = 8;
      let left = r.left + r.width / 2 - PANEL_W / 2;
      left = Math.max(margin, Math.min(left, vw - PANEL_W - margin));
      setCoords({ top: r.bottom + 6, left });
    };
    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, true);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
    };
  }, [open]);

  const pick = (m: ChatModel) => {
    if (m === SMARTER_MODEL && !isBoost) {
      setOpen(false);
      window.dispatchEvent(new CustomEvent('open-upgrade-modal'));
      return;
    }
    setChatModel(m);
    setOpen(false);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex items-center gap-1.5 h-10 px-4 rounded-full border border-input bg-background hover:bg-primary/10 hover:text-primary transition-all glass-shimmer text-sm font-semibold text-foreground/90',
          className,
        )}
        aria-label={`Model: ${current}`}
        title={`Model: ${current} — tap to change`}
      >
        <CurrentIcon className="h-4 w-4 text-primary" />
        <span>{current}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 opacity-60 transition-transform', open && 'rotate-180')} />
      </button>

      {createPortal(
        <AnimatePresence>
          {open && coords && (
            <>
              <div
                className="fixed inset-0 z-[9998]"
                onClick={() => setOpen(false)}
              />
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 380, damping: 26 }}
                style={{ top: coords.top, left: coords.left }}
                className="fixed z-[9999] w-60 rounded-2xl border border-border/60 bg-background/95 backdrop-blur-2xl shadow-2xl p-1.5"
              >
                <Row
                  icon={<Zap className="h-4 w-4 text-primary" />}
                  title="Faster"
                  subtitle="GPT-5.4 Nano · quickest replies"
                  active={chatModel === FASTER_MODEL}
                  onClick={() => pick(FASTER_MODEL)}
                />
                <Row
                  icon={<Brain className="h-4 w-4 text-primary" />}
                  title="Smarter"
                  subtitle="GPT-5.4 Mini · deeper reasoning"
                  active={chatModel === SMARTER_MODEL}
                  onClick={() => pick(SMARTER_MODEL)}
                  locked={!isBoost}
                />
                {!isBoost && (
                  <div className="mt-1 px-2.5 py-1.5 text-[10px] text-muted-foreground border-t border-border/40">
                    Smarter is unlocked with <span className="text-primary font-semibold">Boost</span>.
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

function Row({
  icon,
  title,
  subtitle,
  active,
  locked,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  active?: boolean;
  locked?: boolean;
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
      <div className="w-7 h-7 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold flex items-center gap-1.5">
          {title}
          {locked && <Lock className="h-3 w-3 text-muted-foreground" />}
        </div>
        <div className="text-[10px] text-muted-foreground truncate">{subtitle}</div>
      </div>
      {active && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
    </button>
  );
}
