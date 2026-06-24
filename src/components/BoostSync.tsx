import { useEffect } from 'react';
import { useSubscription } from '@/hooks/useSubscription';
import { useModelStore } from '@/store/useModelStore';

/** Mirrors Boost entitlement into useModelStore so non-React code (services/router) can read it. */
export function BoostSync() {
  const { hasBoost } = useSubscription();
  useEffect(() => {
    useModelStore.getState().setIsBoost(!!hasBoost);
  }, [hasBoost]);
  return null;
}
