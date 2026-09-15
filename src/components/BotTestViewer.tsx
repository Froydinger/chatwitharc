import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, X, Monitor, Smartphone, Check, AlertTriangle } from 'lucide-react';
import { useBotTestStore, type BotTestDevice, type BotTestFrame } from '@/store/useBotTestStore';
import { useBotTestPolling } from '@/hooks/useBotTestPolling';
import { cn } from '@/lib/utils';

// Small on purpose: this sits above the composer like the voice-mode image float.
const FRAME_WIDTH: Record<BotTestDevice, number> = { desktop: 232, mobile: 116 };

function BotCursor({ frame, width }: { frame: BotTestFrame | undefined; width: number }) {
  if (!frame || frame.x === null || frame.y === null || !frame.vw) return null;

  // Frame coordinates are in the sandbox viewport's pixel space; scale them into
  // the rendered PIP. Animating x/y (rather than swapping position) is what makes
  // the cursor glide smoothly between steps despite the low frame rate.
  const scale = width / frame.vw;
  const x = frame.x * scale;
  const y = frame.y * scale;
  const isClick = frame.action === 'click';

  return (
    <motion.div
      className="pointer-events-none absolute left-0 top-0 z-10"
      animate={{ x, y }}
      transition={{ type: 'spring', stiffness: 120, damping: 18, mass: 0.6 }}
    >
      <div className="relative -translate-x-[2px] -translate-y-[2px]">
        {isClick && (
          <motion.span
            key={frame.i}
            className="absolute -left-2 -top-2 h-5 w-5 rounded-full bg-primary/40"
            initial={{ scale: 0.3, opacity: 0.9 }}
            animate={{ scale: 1.7, opacity: 0 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
          />
        )}
        <svg width="13" height="16" viewBox="0 0 13 16" aria-hidden className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
          <path d="M1 1l10.5 6.2-4.6.9 2.5 4.8-2 1-2.5-4.8-3.4 3.2z" fill="white" stroke="black" strokeWidth="1.1" strokeLinejoin="round" />
        </svg>
      </div>
    </motion.div>
  );
}

function DeviceFrame({ device }: { device: BotTestDevice }) {
  const frames = useBotTestStore((s) => s.byDevice[device]);
  const status = useBotTestStore((s) => s.status);
  const latest = frames?.[frames.length - 1];
  const width = FRAME_WIDTH[device];
  const aspect = device === 'desktop' ? '16 / 9' : '9 / 16';

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-primary/25 bg-zinc-950"
      style={{ width, aspectRatio: aspect }}
    >
      <div className="pointer-events-none absolute left-1 top-1 z-20 flex items-center gap-0.5 rounded-md bg-black/55 px-1 py-0.5 text-[8px] font-medium text-white/90 backdrop-blur-sm">
        {device === 'desktop' ? <Monitor className="h-2 w-2" /> : <Smartphone className="h-2 w-2" />}
        <span>{device}</span>
      </div>
      <>
        {latest?.screenshot ? (
          <img
            src={`data:image/jpeg;base64,${latest.screenshot}`}
            alt={`${device} preview`}
            className="h-full w-full object-cover object-top"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {status === 'preparing' ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : (
              <span className="text-[9px] text-muted-foreground">waiting…</span>
            )}
          </div>
        )}
        <BotCursor frame={latest} width={width} />
        {latest && !latest.ok && (
          <div className="absolute inset-x-0 bottom-0 bg-rose-500/85 px-1.5 py-0.5 text-[8px] font-medium text-white">
            step failed
          </div>
        )}
      </>
    </div>
  );
}

/**
 * Live view of the bot driving the app in the cloud sandbox. Deliberately an
 * observation surface, not an interactive preview: the user watches, the bot works.
 */
export function BotTestViewer() {
  useBotTestPolling();

  const runId = useBotTestStore((s) => s.runId);
  const status = useBotTestStore((s) => s.status);
  const devices = useBotTestStore((s) => s.devices);
  const goal = useBotTestStore((s) => s.goal);
  const label = useBotTestStore((s) => s.label);
  const stepsSeen = useBotTestStore((s) => s.stepsSeen);
  const stepCount = useBotTestStore((s) => s.stepCount);
  const reset = useBotTestStore((s) => s.reset);

  const isActive = Boolean(runId) && status !== 'idle';

  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 12 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="pointer-events-auto mx-auto mb-2 w-fit max-w-full"
        >
          <div className="rounded-2xl border border-primary/30 bg-background/85 p-2 shadow-xl backdrop-blur-xl">
            <div className="mb-1.5 flex items-center gap-1.5 px-0.5">
              {status === 'passed' ? (
                <Check className="h-3 w-3 shrink-0 text-emerald-500" />
              ) : status === 'failed' ? (
                <AlertTriangle className="h-3 w-3 shrink-0 text-rose-500" />
              ) : (
                <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" />
              )}
              <span className="truncate text-[10px] font-medium text-foreground">
                {goal || 'Testing the app'}
              </span>
              {stepCount > 0 && status !== 'passed' && status !== 'failed' && (
                <span className="shrink-0 font-mono text-[9px] text-muted-foreground">
                  {Math.min(stepsSeen, stepCount)}/{stepCount}
                </span>
              )}
              <button
                type="button"
                onClick={reset}
                className="ml-auto shrink-0 rounded-full p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Dismiss test viewer"
              >
                <X className="h-3 w-3" />
              </button>
            </div>

            <div className={cn('flex items-center justify-center gap-2', devices.length > 1 && 'pr-0.5')}>
              {devices.map((device) => (
                <DeviceFrame key={device} device={device} />
              ))}
            </div>

            {label && (
              <p className="mt-1 max-w-[260px] truncate px-0.5 text-[9px] text-muted-foreground">{label}</p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
