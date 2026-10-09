import { useAuth } from './useAuth';

export type { Profile } from '@/lib/profileCache';

/** Profile ownership and requests live in AuthProvider, regardless of consumer count. */
export function useProfile() {
  const { profile, profileLoading, profileUpdating, profileError, updateProfile, refetchProfile } = useAuth();
  return {
    profile,
    loading: profileLoading,
    updating: profileUpdating,
    error: profileError,
    updateProfile,
    refetch: refetchProfile,
  };
}
