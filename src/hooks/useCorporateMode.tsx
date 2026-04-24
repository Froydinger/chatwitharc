import { useEffect, useRef } from 'react';
import { useCorporateModeStore } from '@/store/useCorporateModeStore';
import { useAccentStore, type AccentColor } from '@/store/useAccentStore';
import { isMobileLocalDevice } from '@/utils/mobileLocal';

/**
 * Mounted once at the app root. Watches the Corporate Mode flag and:
 *   • Locks the accent to "noir" while enabled.
 *   • Snapshots the previous accent and restores it when disabled.
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

    // ON transition — snapshot previous accent (if not noir) then force noir.
    if (enabled && !wasEnabled.current) {
      const snapshot: AccentColor | null = accent !== 'noir' ? accent : prevAccent;
      setEnabled(true, snapshot);
      if (accent !== 'noir') setAccent('noir');
    }

    // OFF transition — restore the snapshotted accent.
    if (!enabled && wasEnabled.current) {
      const restore = prevAccent && prevAccent !== 'noir' ? prevAccent : 'blue';
      setAccent(restore);
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
