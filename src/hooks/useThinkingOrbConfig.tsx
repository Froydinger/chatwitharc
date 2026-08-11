import { useEffect, useState } from 'react';
import type { OrbState } from 'thinking-orbs';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';

/**
 * Which orb animation Arc plays for each thing it can be doing.
 *
 * The five activities mirror the props ThinkingIndicator already receives, and
 * the defaults reproduce the behaviour that was hard-coded before this became
 * configurable (searching for web/chat lookups, listening for everything else)
 * — so an untouched install looks exactly as it did.
 */
export type ThinkingActivity =
  | 'thinking'
  | 'web'
  | 'chats'
  | 'memory'
  | 'image'
  | 'code'
  | 'writing';

export interface ThinkingActivityMeta {
  id: ThinkingActivity;
  /** admin_settings key holding this activity's orb state */
  key: string;
  label: string;
  /** What the user sees next to the orb, so the admin can preview truthfully. */
  sampleMessage: string;
  description: string;
  defaultState: OrbState;
}

export const THINKING_ACTIVITIES: readonly ThinkingActivityMeta[] = [
  {
    id: 'thinking',
    key: 'thinking_orb_thinking',
    label: 'Thinking',
    sampleMessage: 'Arc is thinking...',
    description: 'The default — a normal chat reply, with the rotating Arc puns.',
    defaultState: 'listening',
  },
  {
    id: 'web',
    key: 'thinking_orb_web',
    label: 'Searching the web',
    sampleMessage: 'Searching the web...',
    description: 'Deep Search and any tool call that reaches the open web.',
    defaultState: 'searching',
  },
  {
    id: 'chats',
    key: 'thinking_orb_chats',
    label: 'Searching past chats',
    sampleMessage: 'Searching past chats...',
    description: 'Looking through the user’s own chat history.',
    defaultState: 'searching',
  },
  {
    id: 'memory',
    key: 'thinking_orb_memory',
    label: 'Accessing memories',
    sampleMessage: 'Accessing memories...',
    description: 'Reading or writing long-term memory.',
    defaultState: 'listening',
  },
  {
    id: 'image',
    key: 'thinking_orb_image',
    label: 'Creating an image',
    sampleMessage: 'Creating your image',
    description: 'Image generation and editing. The full-size loader uses the img-fx effect.',
    defaultState: 'listening',
  },
  {
    id: 'code',
    key: 'thinking_orb_code',
    label: 'Writing code',
    sampleMessage: 'Arc is thinking...',
    description: 'The request resolved to a code Canvas — Arc is generating code.',
    defaultState: 'solving',
  },
  {
    id: 'writing',
    key: 'thinking_orb_writing',
    label: 'Drafting prose',
    sampleMessage: 'Arc is thinking...',
    description: 'The request resolved to a writing Canvas — Arc is drafting long-form text.',
    defaultState: 'composing',
  },
] as const;

/** The nine animations thinking-orbs ships, with plain-language descriptions. */
export const ORB_STATES: readonly { id: OrbState; label: string; description: string }[] = [
  { id: 'working', label: 'Working', description: 'Particles on tilted orbits' },
  { id: 'searching', label: 'Searching', description: 'A scan meridian sweeps a dotted globe' },
  { id: 'solving', label: 'Solving', description: 'Bands scramble, then click back solved' },
  { id: 'listening', label: 'Listening', description: 'A waveform rolls through the rings' },
  { id: 'connecting', label: 'Connecting', description: 'A constellation wires itself' },
  { id: 'weaving', label: 'Weaving', description: 'Three strands plait around the sphere' },
  { id: 'composing', label: 'Composing', description: 'An undulating multi-band sash' },
  { id: 'breathing', label: 'Breathing', description: 'A ring slowly morphing' },
  { id: 'shaping', label: 'Shaping', description: 'Dotted outline: circle → triangle → square' },
] as const;

const VALID_STATES = new Set<string>(ORB_STATES.map((s) => s.id));

export type ThinkingOrbConfig = Record<ThinkingActivity, OrbState>;

export const DEFAULT_ORB_CONFIG: ThinkingOrbConfig = THINKING_ACTIVITIES.reduce(
  (acc, a) => ({ ...acc, [a.id]: a.defaultState }),
  {} as ThinkingOrbConfig,
);

// -----------------------------------------------------------------------------
// Voice mode
// -----------------------------------------------------------------------------

/** The four VoiceStatus values that actually show an indicator ('idle' doesn't). */
export type VoicePhase = 'connecting' | 'listening' | 'thinking' | 'speaking';

export const VOICE_PHASES: readonly {
  id: VoicePhase;
  key: string;
  label: string;
  sampleMessage: string;
  description: string;
  defaultState: OrbState;
}[] = [
  {
    id: 'connecting',
    key: 'voice_orb_connecting',
    label: 'Connecting',
    sampleMessage: 'Connecting...',
    description: 'Opening the realtime session, before the mic goes live.',
    defaultState: 'connecting',
  },
  {
    id: 'listening',
    key: 'voice_orb_listening',
    label: 'Listening',
    sampleMessage: 'Listening',
    description: 'Mic is live and Arc is waiting for the user to speak.',
    defaultState: 'listening',
  },
  {
    id: 'thinking',
    key: 'voice_orb_thinking',
    label: 'Thinking',
    sampleMessage: 'Thinking...',
    description: 'The turn ended and Arc is composing its reply.',
    defaultState: 'working',
  },
  {
    id: 'speaking',
    key: 'voice_orb_speaking',
    label: 'Speaking',
    sampleMessage: 'Speaking',
    description: 'Arc is talking back — the orb rides the output level.',
    defaultState: 'composing',
  },
] as const;

export type VoiceOrbConfig = Record<VoicePhase, OrbState>;

export const DEFAULT_VOICE_CONFIG: VoiceOrbConfig = VOICE_PHASES.reduce(
  (acc, p) => ({ ...acc, [p.id]: p.defaultState }),
  {} as VoiceOrbConfig,
);

// -----------------------------------------------------------------------------
// img-fx image generation effect
// -----------------------------------------------------------------------------

export type ImgFxPreset = 'pixels-organic' | 'pixels-mechanic' | 'sweep-gradient';

export const IMGFX_PRESETS: readonly { id: ImgFxPreset; label: string; description: string }[] = [
  {
    id: 'pixels-organic',
    label: 'Chromium Flow',
    description: 'Soft organic pixel mosaic that drifts and blooms',
  },
  {
    id: 'pixels-mechanic',
    label: 'Nebula',
    description: 'Tighter mechanical mosaic, colder and more regular',
  },
  {
    id: 'sweep-gradient',
    label: 'Gradient Sweep',
    description: 'Diagonal band sweeps top-left → bottom-right with cell flicker',
  },
] as const;

export interface ImgFxConfig {
  enabled: boolean;
  preset: ImgFxPreset;
  /** Cell-size multiplier: 0.5 = finer grid, 2 = chunkier. */
  pixelScale: number;
}

export const IMGFX_KEYS = {
  enabled: 'imgfx_enabled',
  preset: 'imgfx_preset',
  pixelScale: 'imgfx_pixel_scale',
} as const;

export const DEFAULT_IMGFX_CONFIG: ImgFxConfig = {
  enabled: true,
  preset: 'pixels-organic',
  pixelScale: 1,
};

const VALID_PRESETS = new Set<string>(IMGFX_PRESETS.map((p) => p.id));

// -----------------------------------------------------------------------------
// Shared cache + pub/sub, deliberately mirroring useAdminBanner.
//
// This config is read by every chat view but changes roughly never, so it gets
// the same treatment the banner does: fetch ONCE per session, refresh only when
// the tab regains focus, and share one result with every subscriber. No realtime
// channel and no polling — those are a standing monthly cost for a value that a
// single admin edits by hand.
// -----------------------------------------------------------------------------

const ALL_KEYS = [
  ...THINKING_ACTIVITIES.map((a) => a.key),
  ...VOICE_PHASES.map((p) => p.key),
  ...Object.values(IMGFX_KEYS),
];

/**
 * Last-known config, mirrored to localStorage.
 *
 * Without this the first indicator of a session always rendered the defaults:
 * the network read resolves in a few hundred ms, but a fast reply can start AND
 * finish inside that window, so the admin's choice never got a chance to show.
 * Seeding from localStorage means the correct animation is up on the very first
 * frame, and the network read just confirms or corrects it.
 */
const STORAGE_KEY = 'arc:orbConfig:v1';

interface PersistedConfig {
  orb: ThinkingOrbConfig;
  voice: VoiceOrbConfig;
  imgFx: ImgFxConfig;
}

function readPersisted(): PersistedConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedConfig>;
    if (!parsed.orb || !parsed.voice || !parsed.imgFx) return null;
    // Validate every value: a stale entry written by an older build could name
    // an activity or state this build no longer has.
    const orb = THINKING_ACTIVITIES.reduce((acc, a) => {
      const v = parsed.orb?.[a.id];
      acc[a.id] = v && VALID_STATES.has(v) ? v : a.defaultState;
      return acc;
    }, {} as ThinkingOrbConfig);
    const voice = VOICE_PHASES.reduce((acc, p) => {
      const v = parsed.voice?.[p.id];
      acc[p.id] = v && VALID_STATES.has(v) ? v : p.defaultState;
      return acc;
    }, {} as VoiceOrbConfig);
    const preset = parsed.imgFx?.preset;
    const scale = Number(parsed.imgFx?.pixelScale);
    return {
      orb,
      voice,
      imgFx: {
        enabled: parsed.imgFx?.enabled !== false,
        preset: preset && VALID_PRESETS.has(preset) ? preset : DEFAULT_IMGFX_CONFIG.preset,
        pixelScale:
          Number.isFinite(scale) && scale > 0
            ? Math.min(4, Math.max(0.25, scale))
            : DEFAULT_IMGFX_CONFIG.pixelScale,
      },
    };
  } catch {
    return null;
  }
}

const persisted = typeof window !== 'undefined' ? readPersisted() : null;

let cachedConfig: ThinkingOrbConfig = persisted?.orb ?? DEFAULT_ORB_CONFIG;
let cachedVoiceConfig: VoiceOrbConfig = persisted?.voice ?? DEFAULT_VOICE_CONFIG;
let cachedImgFx: ImgFxConfig = persisted?.imgFx ?? DEFAULT_IMGFX_CONFIG;
let inFlight: Promise<void> | null = null;
let lastFetchedAt = 0;
const subscribers = new Set<() => void>();

function notify() {
  subscribers.forEach((fn) => fn());
}

function persist() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ orb: cachedConfig, voice: cachedVoiceConfig, imgFx: cachedImgFx }),
    );
  } catch {
    // Private mode or a full quota — the in-memory cache still works.
  }
}

async function fetchConfigOnce(force = false): Promise<void> {
  if (!supabase || !isSupabaseConfigured) return;
  if (!force && Date.now() - lastFetchedAt < 60_000) return;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      // Only authenticated users can read these rows (see the RLS policy in
      // 20260811120000_add_thinking_orb_settings.sql). Skipping the query while
      // signed out keeps the landing page free of a guaranteed 401.
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) return;

      const { data, error } = await supabase
        .from('admin_settings')
        .select('key, value')
        .in('key', ALL_KEYS);

      if (error) throw error;

      const byKey = (data || []).reduce<Record<string, string>>((acc, row) => {
        acc[row.key] = row.value;
        return acc;
      }, {});

      // Unknown values fall back rather than reaching the orb: a typo in the DB
      // would otherwise render nothing at all.
      cachedConfig = THINKING_ACTIVITIES.reduce((acc, activity) => {
        const stored = byKey[activity.key];
        acc[activity.id] =
          stored && VALID_STATES.has(stored) ? (stored as OrbState) : activity.defaultState;
        return acc;
      }, {} as ThinkingOrbConfig);

      cachedVoiceConfig = VOICE_PHASES.reduce((acc, phase) => {
        const stored = byKey[phase.key];
        acc[phase.id] =
          stored && VALID_STATES.has(stored) ? (stored as OrbState) : phase.defaultState;
        return acc;
      }, {} as VoiceOrbConfig);

      const storedPreset = byKey[IMGFX_KEYS.preset];
      const storedScale = Number.parseFloat(byKey[IMGFX_KEYS.pixelScale] ?? '');
      cachedImgFx = {
        // Absent means "never configured", which should keep the effect on.
        enabled: byKey[IMGFX_KEYS.enabled] !== 'false',
        preset:
          storedPreset && VALID_PRESETS.has(storedPreset)
            ? (storedPreset as ImgFxPreset)
            : DEFAULT_IMGFX_CONFIG.preset,
        pixelScale:
          Number.isFinite(storedScale) && storedScale > 0
            ? Math.min(4, Math.max(0.25, storedScale))
            : DEFAULT_IMGFX_CONFIG.pixelScale,
      };

      lastFetchedAt = Date.now();
      persist();
      notify();
    } catch (err) {
      // Non-fatal: the defaults are the previous hard-coded behaviour.
      console.debug('Thinking orb config fetch failed, using defaults:', err);
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Force a refetch — call after an admin saves so open tabs pick the change up. */
export function refreshThinkingOrbConfig(): Promise<void> {
  return fetchConfigOnce(true);
}

// Warm the cache as soon as this module loads rather than waiting for the first
// indicator to mount. ThinkingIndicator is imported eagerly by the chat view, so
// this runs long before anything renders — and the auth listener covers the case
// where the session only arrives after hydration.
if (typeof window !== 'undefined' && supabase && isSupabaseConfigured) {
  void fetchConfigOnce();
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {
      void fetchConfigOnce(true);
    }
  });
}

/**
 * Subscribe to the shared cache, projecting out just the slice a caller needs so
 * a voice-only consumer doesn't re-render when the image settings change.
 */
function useConfigSlice<T>(read: () => T): T {
  const [value, setValue] = useState<T>(read);

  useEffect(() => {
    const update = () => setValue(read());
    subscribers.add(update);
    void fetchConfigOnce();
    update();

    const onFocus = () => void fetchConfigOnce();
    window.addEventListener('focus', onFocus);

    return () => {
      subscribers.delete(update);
      window.removeEventListener('focus', onFocus);
    };
    // `read` closes over nothing but module state; re-subscribing per render
    // would thrash the subscriber set for no benefit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return value;
}

/** Read the configured orb state for every chat activity. */
export function useThinkingOrbConfig(): ThinkingOrbConfig {
  return useConfigSlice(() => cachedConfig);
}

/** Read the configured orb state for every voice-mode phase. */
export function useVoiceOrbConfig(): VoiceOrbConfig {
  return useConfigSlice(() => cachedVoiceConfig);
}

/** Read the img-fx image-generation effect settings. */
export function useImgFxConfig(): ImgFxConfig {
  return useConfigSlice(() => cachedImgFx);
}
