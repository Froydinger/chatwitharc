import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MoonStar, Rocket, Stone, Sun, RefreshCcwDot, Check, ChevronDown, Lock } from 'lucide-react';
import { useModelStore, AUTO_MODEL, NANO_MODEL, LUNA_MODEL, TERRA_MODEL, SOL_MODEL, type ChatModel } from '@/store/useModelStore';
import { useSubscription } from '@/hooks/useSubscription';
import { cn } from '@/lib/utils';

// Restore point marker — safe rebuild checkpoint
interface Props {
  className?: string;
  compact?: boolean;
  /** kept for backwards compat — dropdown is portaled and auto-anchors below button */
  placement?: 'up' | 'down';
}

export function ChatModelPicker({ className }: Props) {
  const chatModel = useModelStore((s) => s.chatModel);
  const setChatModel = useModelStore((s) => s.setChatModel);
  const { hasBoost, openCheckout } = useSubscription();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  let current = 'Auto';
  let CurrentIcon = RefreshCcwDot;
  if (chatModel === NANO_MODEL) {
    current = 'Astro';
    CurrentIcon = Rocket;
  } else if (chatModel === LUNA_MODEL) {
    current = 'Luna';
    CurrentIcon = MoonStar;
  } else if (chatModel === TERRA_MODEL) {
    current = 'Terra';
    CurrentIcon = Stone;
  } else if (chatModel === SOL_MODEL) {
    current = 'Sol';
    CurrentIcon = Sun;
  }

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
    if (m === SOL_MODEL && !hasBoost) {
      openCheckout();
      setOpen(false);
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
          'glass-btn inline-flex items-center gap-1.5 h-10 px-4 rounded-full text-sm font-semibold text-foreground/90',
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
                className="fixed z-[9999] w-60 rounded-2xl border border-border/40 glass shadow-2xl p-1.5"
              >
                <Row
                  icon={<RefreshCcwDot className="h-4 w-4 text-primary" />}
                  title="Auto"
                  subtitle="Best for letting Arc choose"
                  active={chatModel === AUTO_MODEL}
                  onClick={() => pick(AUTO_MODEL)}
                />
                <Row
                  icon={<Rocket className="h-4 w-4 text-primary" />}
                  title="Astro"
                  subtitle="Best for quick chats"
                  active={chatModel === NANO_MODEL}
                  onClick={() => pick(NANO_MODEL)}
                />
                <Row
                  icon={<MoonStar className="h-4 w-4 text-primary" />}
                  title="Luna"
                  subtitle="Best for quick reasoning"
                  active={chatModel === LUNA_MODEL}
                  onClick={() => pick(LUNA_MODEL)}
                />
                <Row
                  icon={<Stone className="h-4 w-4 text-primary" />}
                  title="Terra"
                  subtitle="Best for code & writing"
                  active={chatModel === TERRA_MODEL}
                  onClick={() => pick(TERRA_MODEL)}
                />
                <Row
                  icon={<Sun className="h-4 w-4 text-primary" />}
                  title="Sol"
                  subtitle="Best for deep work"
                  active={chatModel === SOL_MODEL}
                  gated={!hasBoost}
                  onClick={() => pick(SOL_MODEL)}
                />
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
  gated,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  active?: boolean;
  gated?: boolean;
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
        <div className="text-xs font-semibold flex items-center justify-between gap-1.5">
          <span>{title}</span>
          {gated && <Lock className="h-3 w-3 text-muted-foreground/60" />}
        </div>
        <div className="text-[10px] text-muted-foreground truncate">{subtitle}</div>
      </div>
      {active && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
    </button>
  );
}
