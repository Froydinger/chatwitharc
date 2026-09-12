import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useEffect, useRef, useState } from 'react';
import './chat-voice-picker.css';
import { ChevronDown, X } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { LiquidMetalOverlay } from '@/components/ui/liquid-metal-overlay';
import { VoiceMagneticPicker } from '@/components/VoiceMagneticPicker';
import type { VoiceName } from '@/store/useVoiceModeStore';

export function ChatVoicePicker({ name, selectedVoice, onSelect }: {
  name: string; selectedVoice: VoiceName; onSelect: (voice: VoiceName) => void;
}) {
  const mobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState('');
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  useEffect(() => {
    if (!open) return;
    // Commit the initial scale before transitioning to the visible state.
    void panel.current?.offsetHeight;
    const frame = requestAnimationFrame(() => setPhase('is-open'));
    return () => cancelAnimationFrame(frame);
  }, [open]);
  const changeOpen = (next: boolean) => {
    clearTimeout(closeTimer.current);
    if (next) { setPhase(''); setOpen(true); return; }
    setPhase('is-closing');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--modal-close-dur')) || 150;
    closeTimer.current = setTimeout(() => { setOpen(false); setPhase(''); }, reduced ? 0 : duration);
  };
  const trigger = (
    <button type="button"
      className="flex h-8 max-w-[104px] shrink-0 items-center gap-1 rounded-full border border-border/40 bg-muted/25 px-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
      aria-label={`Choose voice: ${name}`} title="Choose voice">
      <span className="truncate">{name}</span>
      <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
    </button>
  );
  const picker = <VoiceMagneticPicker selectedVoice={selectedVoice} onSelect={onSelect} compact />;
  if (mobile) return (
    <DialogPrimitive.Root open={open} onOpenChange={changeOpen}>
      <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[9998] bg-black/40 backdrop-blur-sm transition-opacity duration-150" style={{ opacity: phase === 'is-open' ? 1 : 0 }} />
        <DialogPrimitive.Content aria-describedby={undefined}
          ref={panel} style={{ translate: '-50% -50%' }}
          className={`t-modal ${phase} liquid-metal-surface fixed left-1/2 top-[50dvh] z-[9999] w-[min(calc(100vw-32px),340px)] max-h-[calc(100dvh-32px)] overflow-y-auto rounded-[28px] border border-white/[0.14] bg-black p-0 text-white shadow-2xl outline-none`}>
          <DialogPrimitive.Title className="sr-only">Choose Arc’s voice</DialogPrimitive.Title>
          <LiquidMetalOverlay preset="chromatic" strength={0.48} />
          {picker}
          <DialogPrimitive.Close aria-label="Close voice picker" className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full text-white/60 hover:text-white focus-visible:ring-2 focus-visible:ring-white">
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" side="top" sideOffset={4} collisionPadding={16}
        metalPreset="chromatic" metalStrength={0.48}
        className="voice-picker-popover w-[min(calc(100vw-32px),340px)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto rounded-[28px] border-white/[0.14] !bg-black !p-0 shadow-2xl backdrop-blur-xl">
        {picker}
      </PopoverContent>
    </Popover>
  );
}
