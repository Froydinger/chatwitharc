import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { useModelStore } from '@/store/useModelStore';

/** Mirrors Boost entitlement into useModelStore so non-React code (services/router) can read it. */
export function BoostSync() {
  const { hasVerifiedBoost, isVerifiedModelAdmin: isAdmin, loading } = useSubscription();
  const { user, loading: authLoading } = useAuth();
  useEffect(() => {
    const verified = !loading && !authLoading && Boolean(user?.id && !user.is_anonymous);
    useModelStore.getState().setIsBoost(verified && hasVerifiedBoost);
    useModelStore.getState().setIsAdmin(verified && isAdmin);
  }, [hasVerifiedBoost, isAdmin, loading, authLoading, user?.id, user?.is_anonymous]);
  return null;
}
