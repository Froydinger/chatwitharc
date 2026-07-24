import { useEffect, useRef } from 'react';
import { useCorporateModeStore } from '@/store/useCorporateModeStore';
import { useAccentStore, type AccentColor } from '@/store/useAccentStore';
import { isMobileLocalDevice } from '@/utils/mobileLocal';

/**
 * Mounted once at the app root. Watches the Corporate Mode flag and:
 *   • Keeps the shared Noir palette applied while enabled.
 *
 * The store itself drives gating in routeRequest, ChatInput, useChatSync etc.
 * This hook is purely the visual + restoration side-effect.
 */
export function useCorporateModeEnforcer() {
  const enabled = useCorporateModeStore((s) => s.enabled);
  const prevAccent = useCorporateModeStore((s) => s.prevAccent);
  const setEnabled = useCorporateModeStore((s) => s.setEnabled);
  const accent = useAccentStore((s) => s.accentColor);
  const setAccent = useAccentStore((s) => s.setAccentColorLocal);

  // Track last applied state so we only act on real transitions.
  const wasEnabled = useRef<boolean | null>(null);

  useEffect(() => {
    if (isMobileLocalDevice()) {
      if (enabled) setEnabled(false, prevAccent);
      wasEnabled.current = false;
      return;
    }

    // First mount: align without snapshotting.
    if (wasEnabled.current === null) {
      if (enabled && accent !== 'noir') setAccent('noir');
      wasEnabled.current = enabled;
      return;
    }

    // ON transition — retain legacy state only for backwards-compatible
    // persistence, then force Noir.
    if (enabled && !wasEnabled.current) {
      const snapshot: AccentColor | null = accent !== 'noir' ? accent : prevAccent;
      setEnabled(true, snapshot);
      if (accent !== 'noir') setAccent('noir');
    }

    // OFF transition — Noir remains the global palette.
    if (!enabled && wasEnabled.current) {
      setAccent('noir');
    }

    wasEnabled.current = enabled;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // While enabled, keep the accent pinned to noir even if something else tries to change it.
  useEffect(() => {
    if (enabled && accent !== 'noir') {
      setAccent('noir');
    }
  }, [enabled, accent, setAccent]);
}
