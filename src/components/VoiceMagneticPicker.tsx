import { useMemo, useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { useReducedMotionPreference } from '@/hooks/useReducedMotionPreference';
import { useNativeListLayout } from '@/hooks/useNativeListLayout';
import './voice-magnetic-picker.css';
import { Check } from 'lucide-react';
import { REALTIME_VOICES, VOICE_AVATARS } from '@/constants/voices';
import type { VoiceName } from '@/store/useVoiceModeStore';
import { cn } from '@/lib/utils';

type VoiceMagneticPickerProps = {
  selectedVoice: VoiceName;
  onSelect: (voice: VoiceName) => void;
  compact?: boolean;
};

const voiceIds: VoiceName[] = ['marin', 'cedar', 'ripple', 'quartz'];
const voiceTones: Record<VoiceName, string> = {
  marin: 'Expressive',
  cedar: 'Natural',
  ripple: 'Warm',
  quartz: 'Bright',
};

function clamp(value: number, limit: number) {
  return Math.max(-limit, Math.min(limit, value));
}

function MagneticVoiceBubble({
  voice,
  selected,
  centerSlot,
  compact,
  style,
  onSelect,
}: {
  voice: (typeof REALTIME_VOICES)[number];
  selected: boolean;
  centerSlot: boolean;
  compact: boolean;
  style: CSSProperties;
  onSelect: (voice: VoiceName) => void;
}) {
  const reduceMotion = useReducedMotionPreference();
  const button = useRef<HTMLButtonElement>(null);
  const move = (x:number,y:number) => {
    button.current?.style.setProperty('--voice-x', `${x}px`);
    button.current?.style.setProperty('--voice-y', `${y}px`);
  };
  useEffect(()=>{if(reduceMotion)move(0,0);},[reduceMotion]);

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (reduceMotion) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const pull = centerSlot ? 0.08 : 0.18;
    const limit = centerSlot ? 8 : 15;
    move(clamp(dx * pull, limit),clamp(dy * pull, limit));
  };

  const release = () => {
    move(0,0);
  };

  return (
    <div data-layout-row className="absolute" style={style}>
      <div className="-translate-x-1/2 -translate-y-1/2">
        <div className="arc-voice-pulse" data-selected={selected}>
        <button ref={button}
        type="button"
        onPointerMove={handlePointerMove}
        onPointerLeave={release}
        onFocus={() => {
          if (!reduceMotion) {
            move(centerSlot ? 4 : 7,centerSlot ? -3 : -5);
          }
        }}
        onBlur={release}
        onClick={() => onSelect(voice.id)}
        aria-pressed={selected}
        aria-label={`${voice.name}${voice.recommended ? ', best voice' : ''}${selected ? ', selected' : ''}`}
        title={voice.name}
        className={cn(
          'arc-voice-magnetic group relative flex items-center justify-center rounded-full border bg-black shadow-[0_10px_28px_rgba(0,0,0,0.55)] outline-none transition-[border-color,box-shadow,background-color] focus-visible:ring-2 focus-visible:ring-primary/75',
          selected
            ? compact
              ? 'h-[82px] w-[82px]'
              : 'h-[104px] w-[104px]'
            : compact
              ? 'h-[54px] w-[54px]'
              : 'h-[68px] w-[68px]',
          selected
            ? 'border-foreground/75 shadow-[0_0_26px_hsl(var(--primary)/0.22),0_10px_28px_rgba(0,0,0,0.62)] dark:border-white/[0.72]'
            : 'border-foreground/20 hover:border-foreground/55 hover:bg-white/[0.035] dark:border-white/[0.12] dark:hover:border-white/35',
        )}
      >
        <span className={cn('flex h-full w-full items-center justify-center overflow-hidden rounded-full p-1.5', selected && 'p-2')}>
          <img src={VOICE_AVATARS[voice.id]} alt="" className="h-full w-full object-contain" />
        </span>
        {selected && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-black bg-white text-black shadow-lg">
            <Check className="h-3 w-3" strokeWidth={3} />
          </span>
        )}
          </button>
        </div>
      </div>
    </div>
  );
}

export function VoiceMagneticPicker({ selectedVoice, onSelect, compact = false }: VoiceMagneticPickerProps) {
  const layout = useNativeListLayout();
  const availableVoices = useMemo(
    () => voiceIds
      .map((id) => REALTIME_VOICES.find((voice) => voice.id === id))
      .filter((voice): voice is (typeof REALTIME_VOICES)[number] => Boolean(voice)),
    [],
  );
  const selected = availableVoices.find((voice) => voice.id === selectedVoice) ?? availableVoices[0];
  // Keep Marina as the fixed anchor. The other three centers sit on the same
  // circle around it: one at 12 o'clock, then two at 150° and 30°. Using the
  // same radius for both picker sizes keeps the composition symmetrical while
  // leaving the selected bubble free to grow in its own slot.
  const centerY = compact ? 52 : 51;
  const radius = compact ? 116 : 130;
  const sideOffset = Math.round(radius * Math.sqrt(3) / 2);
  const lowerOffset = Math.round(radius / 2);
  const rileyOffset = sideOffset + (compact ? 10 : 8);
  const centered = (left: string, top: string): CSSProperties => ({
    left,
    top,
  });
  const selectedIndex = voiceIds.indexOf(selected.id);
  const shuffledSurroundingIds = [1, 2, 3].map((offset) => voiceIds[(selectedIndex + offset) % voiceIds.length]);
  const [topId, bottomLeftId, bottomRightId] = shuffledSurroundingIds;
  const slots = [
    { id: selected.id, style: centered('50%', `${centerY}%`), centerSlot: true },
    { id: topId, style: centered('50%', `calc(${centerY}% - ${radius}px)`), centerSlot: false },
    { id: bottomLeftId, style: centered(`calc(50% - ${rileyOffset}px)`, `calc(${centerY}% + ${lowerOffset}px)`), centerSlot: false },
    { id: bottomRightId, style: centered(`calc(50% + ${sideOffset}px)`, `calc(${centerY}% + ${lowerOffset}px)`), centerSlot: false },
  ];

  return (
    <div ref={layout} className={cn('relative mx-auto w-full bg-transparent', compact ? 'h-[326px] max-w-[310px]' : 'h-[330px] max-w-[440px]')} aria-label="Choose a voice">
      <div className="pointer-events-none absolute left-[15px] top-4 z-10 text-sm font-medium tracking-tight text-foreground/55">
        Voice:
      </div>
      {slots.map((slot) => {
        const voice = availableVoices.find((candidate) => candidate.id === slot.id);
        if (!voice) return null;
        return (
          <MagneticVoiceBubble
            key={voice.id}
            voice={voice}
            selected={voice.id === selected.id}
            centerSlot={slot.centerSlot}
            compact={compact}
            style={slot.style}
            onSelect={onSelect}
          />
        );
      })}
      <div className="pointer-events-none absolute bottom-3 left-0 right-0 text-center">
        <span className="text-xs font-medium text-foreground/90">{selected.name}</span>
        <span className="ml-1.5 text-[11px] text-foreground/55">{voiceTones[selected.id]}</span>
        {selected.recommended && <span className="ml-1.5 text-[10px] font-semibold text-emerald-400">Best</span>}
      </div>
    </div>
  );
}
