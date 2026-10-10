import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { readTextUsage, setTextUsageOwner, type TextUsagePool, type TextUsageSnapshot } from '@/services/arcTextUsage';

/** Owner-scoped, read-only premium usage. Missing/off policy never looks like 0%. */
export function useTextUsage(pool: TextUsagePool, enabled = true) {
  const { user, loading: authLoading } = useAuth();
  const ownerId = !authLoading && user?.id && !user.is_anonymous ? user.id : null;
  const activeScope = useRef({ ownerId, pool, enabled });
  activeScope.current = { ownerId, pool, enabled };
  const [state, setState] = useState<{ ownerId: string | null; pool: TextUsagePool; snapshot: TextUsageSnapshot | null; loading: boolean }>({
    ownerId: null, pool, snapshot: null, loading: true,
  });
  const refresh = useCallback(async (force = true) => {
    setTextUsageOwner(ownerId);
    if (!ownerId || !enabled) { setState({ ownerId, pool, snapshot: null, loading: false }); return; }
    setState(previous => ({ ownerId, pool, snapshot: previous.ownerId === ownerId && previous.pool === pool ? previous.snapshot : null, loading: true }));
    const snapshot = await readTextUsage(ownerId, pool, force);
    if (activeScope.current.ownerId === ownerId && activeScope.current.pool === pool && activeScope.current.enabled === enabled) {
      setState({ ownerId, pool, snapshot, loading: false });
    }
  }, [ownerId, pool, enabled]);
  useEffect(() => {
    let active = true;
    setTextUsageOwner(ownerId);
    const load = async () => {
      if (!ownerId || !enabled) { setState({ ownerId, pool, snapshot: null, loading: false }); return; }
      const snapshot = await readTextUsage(ownerId, pool);
      if (active) setState({ ownerId, pool, snapshot, loading: false });
    };
    void load();
    const onChanged = () => { void load(); };
    window.addEventListener('arc-text-usage-changed', onChanged);
    return () => { active = false; window.removeEventListener('arc-text-usage-changed', onChanged); };
  }, [ownerId, pool, enabled]);
  const belongsToOwner = state.ownerId === ownerId && state.pool === pool;
  return { snapshot: belongsToOwner && enabled ? state.snapshot : null,
    loading: authLoading || (enabled && ownerId !== null && (!belongsToOwner || state.loading)), refresh };
}
