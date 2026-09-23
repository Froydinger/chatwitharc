import { useEffect } from 'react';
import { useSubscription } from '@/hooks/useSubscription';
import { useModelStore } from '@/store/useModelStore';

/** Mirrors Boost entitlement into useModelStore so non-React code (services/router) can read it. */
export function BoostSync() {
  const { hasBoost, loading } = useSubscription();
  useEffect(() => {
    useModelStore.getState().setIsBoost(!!hasBoost);
    if (!loading && !hasBoost && useModelStore.getState().reasoningEffort === 'high') {
      useModelStore.getState().setReasoningEffort('medium');
    }
  }, [hasBoost, loading]);
  return null;
}
