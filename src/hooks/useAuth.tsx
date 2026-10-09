import { useState, useEffect, useCallback, useSyncExternalStore, createContext, useContext } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { createProfileCache, type Profile, type ProfileUpdates } from "@/lib/profileCache";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  profileLoading: boolean;
  profileUpdating: boolean;
  profileError: Error | null;
  updateProfile: (updates: ProfileUpdates) => Promise<Profile>;
  refetchProfile: () => Promise<Profile | null>;
  invalidateProfile: (userId: string) => Promise<Profile | null>;
  loading: boolean;
  needsOnboarding: boolean;
  /** True when the active session is an anonymous Supabase user (guest mode). */
  isAnonymous: boolean;
  /**
   * Start a guest session. Chat works; everything else routes through
   * useRequireAuth and prompts for a real account.
   */
  continueAsGuest: () => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  profileLoading: false,
  profileUpdating: false,
  profileError: null,
  updateProfile: async () => { throw new Error('No authenticated user found'); },
  refetchProfile: async () => null,
  invalidateProfile: async () => null,
  loading: true,
  needsOnboarding: false,
  isAnonymous: false,
  continueAsGuest: async () => ({ error: null }),
});

async function loadProfile(user: User, isCurrent: () => boolean): Promise<Profile | null> {
  if (!supabase || !isSupabaseConfigured) return null;
  const { data, error } = await supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  if (data || !isCurrent()) return data;

  // Only a confirmed missing row warrants creation. A failed read must never
  // trigger a write, and metadata must belong to the same captured account.
  const displayName = user.user_metadata?.display_name || user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'New User';
  const { data: created, error: createError } = await supabase.from('profiles').insert({
    user_id: user.id,
    display_name: displayName,
    welcome_email_sent: false,
  }).select().single();
  if (!createError) return created;
  // A sign-up trigger or another tab may have created the row after our read.
  if (createError.code === '23505' && isCurrent()) {
    const { data: existing, error: retryError } = await supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
    if (retryError) throw retryError;
    return existing;
  }
  throw createError;
}

async function saveProfile(userId: string, updates: ProfileUpdates): Promise<Profile> {
  if (!supabase || !isSupabaseConfigured) throw new Error('Supabase is not configured');
  const { data, error } = await supabase.from('profiles').update(updates).eq('user_id', userId).select().single();
  if (error) throw error;
  return data;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileCache] = useState(() => createProfileCache({ load: loadProfile, update: saveProfile }));
  const profileState = useSyncExternalStore(profileCache.subscribe, profileCache.getSnapshot, profileCache.getSnapshot);
  // Bind actions to this account generation. An old component callback must
  // never save to a different account (or a later sign-in of the same account).
  const updateProfile = useCallback((updates: ProfileUpdates) => profileCache.update(updates, profileState.generation), [profileCache, profileState.generation]);
  // Explicit refresh follows external writes such as avatar uploads, so fence
  // any read that started before the write instead of joining its stale result.
  const refetchProfile = useCallback(() => profileState.userId
    ? profileCache.invalidate(profileState.userId, profileState.generation)
    : Promise.resolve(null), [profileCache, profileState.generation, profileState.userId]);

  useEffect(() => {
    let mounted = true;
    let authEventVersion = 0;
    let profileTimer: ReturnType<typeof setTimeout> | undefined;

    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }

    const timeout = setTimeout(() => {
      if (mounted) {
        console.warn('Auth initialization timed out, continuing anyway');
        setLoading(false);
      }
    }, 5000);

    const applySession = (nextSession: Session | null) => {
      if (!mounted) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      // Repeated SIGNED_IN, INITIAL_SESSION and TOKEN_REFRESHED events for the
      // same account must not fetch the profile again.
      if (profileCache.activate(nextSession?.user ?? null)) {
        clearTimeout(profileTimer);
        const generation = profileCache.getSnapshot().generation;
        // Keep Supabase queries outside the synchronous auth callback.
        if (profileCache.getSnapshot().userId) {
          profileTimer = setTimeout(() => {
            if (mounted) void profileCache.ensure(generation);
          }, 0);
        }
      }
      setLoading(false);
      clearTimeout(timeout);
    };

    const versionBeforeRead = authEventVersion;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      authEventVersion += 1;
      applySession(nextSession);
    });

    let reconnectPending = false;
    const revalidateProfile = (event: Event) => {
      if (event.type === 'online') reconnectPending = true;
      if (document.visibilityState === 'hidden') return;
      const reconnected = reconnectPending;
      reconnectPending = false;
      void profileCache.revalidate(reconnected);
    };
    window.addEventListener('focus', revalidateProfile);
    window.addEventListener('online', revalidateProfile);
    document.addEventListener('visibilitychange', revalidateProfile);

    void supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      // A late bootstrap result must not undo a newer logout/account change.
      if (mounted && authEventVersion === versionBeforeRead) applySession(initialSession);
    }).catch(error => {
      console.error('Auth initialization error:', error);
      if (mounted) {
        setLoading(false);
        clearTimeout(timeout);
      }
    });

    return () => {
      mounted = false;
      clearTimeout(timeout);
      clearTimeout(profileTimer);
      subscription.unsubscribe();
      window.removeEventListener('focus', revalidateProfile);
      window.removeEventListener('online', revalidateProfile);
      document.removeEventListener('visibilitychange', revalidateProfile);
      profileCache.activate(null);
    };
  }, [profileCache]);

  const isAnonymous = !!user?.is_anonymous;
  const profile = profileState.userId === user?.id ? profileState.profile : null;
  const needsOnboarding = !!profile && (!profile.display_name || profile.display_name === 'New User');

  const continueAsGuest = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      return { error: null };
    } catch (e) {
      console.error('Guest sign-in failed:', e);
      return { error: e instanceof Error ? e : new Error('Guest sign-in failed') };
    }
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      session,
      profile,
      profileLoading: loading || profileState.loading,
      profileUpdating: profileState.updating,
      profileError: profileState.error,
      updateProfile,
      refetchProfile,
      invalidateProfile: profileCache.invalidate,
      loading,
      needsOnboarding,
      isAnonymous,
      continueAsGuest,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
