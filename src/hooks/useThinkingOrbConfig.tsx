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
export type ThinkingActivity = 'thinking' | 'web' | 'chats' | 'memory' | 'image';

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
    description: 'Image generation and editing. The full-size loader uses the Arc logo instead.',
    defaultState: 'listening',
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
// Shared cache + pub/sub, deliberately mirroring useAdminBanner.
//
// This config is read by every chat view but changes roughly never, so it gets
// the same treatment the banner does: fetch ONCE per session, refresh only when
// the tab regains focus, and share one result with every subscriber. No realtime
// channel and no polling — those are a standing monthly cost for a value that a
// single admin edits by hand.
// -----------------------------------------------------------------------------

const ORB_KEYS = THINKING_ACTIVITIES.map((a) => a.key);

let cachedConfig: ThinkingOrbConfig = DEFAULT_ORB_CONFIG;
let inFlight: Promise<void> | null = null;
let lastFetchedAt = 0;
const subscribers = new Set<() => void>();

function notify() {
  subscribers.forEach((fn) => fn());
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
        .in('key', ORB_KEYS);

      if (error) throw error;

      const byKey = (data || []).reduce<Record<string, string>>((acc, row) => {
        acc[row.key] = row.value;
        return acc;
      }, {});

      cachedConfig = THINKING_ACTIVITIES.reduce((acc, activity) => {
        const stored = byKey[activity.key];
        // Unknown values fall back rather than reaching the orb: a typo in the
        // DB would otherwise render nothing at all.
        acc[activity.id] =
          stored && VALID_STATES.has(stored) ? (stored as OrbState) : activity.defaultState;
        return acc;
      }, {} as ThinkingOrbConfig);

      lastFetchedAt = Date.now();
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

/** Read the configured orb state for every activity. */
export function useThinkingOrbConfig(): ThinkingOrbConfig {
  const [config, setConfig] = useState<ThinkingOrbConfig>(cachedConfig);

  useEffect(() => {
    const update = () => setConfig(cachedConfig);
    subscribers.add(update);
    void fetchConfigOnce();

    const onFocus = () => void fetchConfigOnce();
    window.addEventListener('focus', onFocus);

    return () => {
      subscribers.delete(update);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  return config;
}
