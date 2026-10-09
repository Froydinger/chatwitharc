import type { User } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type ProfileUpdates = Partial<Omit<Profile, 'id' | 'user_id' | 'created_at' | 'updated_at'>>;

interface ProfileSnapshot {
  generation: number;
  userId: string | null;
  profile: Profile | null;
  loading: boolean;
  updating: boolean;
  error: Error | null;
}

interface ProfileRepository {
  load: (user: User, isCurrent: () => boolean) => Promise<Profile | null>;
  update: (userId: string, updates: ProfileUpdates) => Promise<Profile>;
}

const sessionChanged = () => new Error('The signed-in account changed. Please try again.');
const asError = (error: unknown) => error instanceof Error
  ? error
  : new Error((error as { message?: string })?.message || 'Profile request failed');

export const PROFILE_REVALIDATE_INTERVAL_MS = 60_000;

/** One cache per AuthProvider. Never retain a previous account's profile. */
export function createProfileCache(repository: ProfileRepository, now = Date.now) {
  let owner: User | null = null;
  let generation = 0;
  let revision = 0;
  let loaded = false;
  let lastCheckedAt = -Infinity;
  let inFlight: Promise<Profile | null> | null = null;
  let mutationTail: Promise<void> = Promise.resolve();
  let pendingUpdates = 0;
  let snapshot: ProfileSnapshot = {
    generation, userId: null, profile: null, loading: false, updating: false, error: null,
  };
  const listeners = new Set<() => void>();
  const publish = (changes: Partial<ProfileSnapshot>) => {
    snapshot = { ...snapshot, ...changes };
    listeners.forEach(listener => listener());
  };
  const isCurrent = (expected: number) => generation === expected;

  const activate = (user: User | null) => {
    const nextOwner = user && !user.is_anonymous ? user : null;
    if (owner?.id === nextOwner?.id) {
      owner = nextOwner;
      return false;
    }
    owner = nextOwner;
    generation += 1;
    revision += 1;
    loaded = false;
    lastCheckedAt = -Infinity;
    inFlight = null;
    mutationTail = Promise.resolve();
    pendingUpdates = 0;
    publish({ generation, userId: owner?.id ?? null, profile: null, loading: !!owner, updating: false, error: null });
    return true;
  };

  const refetch = (expectedGeneration = generation): Promise<Profile | null> => {
    if (!owner || !isCurrent(expectedGeneration)) return Promise.resolve(null);
    if (inFlight) return inFlight;
    const user = owner;
    // Wait for local writes so a read cannot race ahead of an update response.
    const request = (async () => {
      await mutationTail;
      while (isCurrent(expectedGeneration) && pendingUpdates > 0) await mutationTail;
      if (!isCurrent(expectedGeneration) || inFlight !== request) return null;
      const readRevision = revision;
      const ownsRead = () => isCurrent(expectedGeneration) && revision === readRevision && inFlight === request;
      try {
        const profile = await repository.load(user, ownsRead);
        if (!ownsRead()) return null;
        loaded = true;
        publish({ profile, error: null });
        return profile;
      } catch (error) {
        if (ownsRead()) {
          loaded = false;
          publish({ error: asError(error) });
        }
        return null;
      } finally {
        if (isCurrent(expectedGeneration) && inFlight === request) {
          inFlight = null;
          publish({ loading: false });
        }
      }
    })();
    inFlight = request;
    lastCheckedAt = now();
    publish({ loading: true, error: null });
    return request;
  };

  const ensure = (expectedGeneration = generation) => {
    if (!isCurrent(expectedGeneration)) return Promise.resolve(null);
    return loaded ? Promise.resolve(snapshot.profile) : refetch(expectedGeneration);
  };

  const update = (updates: ProfileUpdates, expectedGeneration = generation): Promise<Profile> => {
    if (!owner || !isCurrent(expectedGeneration)) return Promise.reject(sessionChanged());
    const userId = owner.id;
    const patch = { ...updates };
    // Immediately fence any old read, including a missing-profile fallback.
    revision += 1;
    inFlight = null;
    pendingUpdates += 1;
    publish({ updating: true, loading: false, error: null });
    // Serialize saves so older writes cannot finish after newer ones on the server.
    const request = mutationTail.then(async () => {
      if (!isCurrent(expectedGeneration)) throw sessionChanged();
      try {
        const profile = await repository.update(userId, patch);
        if (!isCurrent(expectedGeneration)) throw sessionChanged();
        revision += 1;
        loaded = true;
        lastCheckedAt = now();
        publish({ profile, error: null });
        return profile;
      } catch (error) {
        if (isCurrent(expectedGeneration)) publish({ error: asError(error) });
        throw error;
      } finally {
        if (isCurrent(expectedGeneration)) {
          pendingUpdates -= 1;
          publish({ updating: pendingUpdates > 0 });
        }
      }
    });
    // A rejected save must not prevent later saves or refreshes from running.
    mutationTail = request.then(() => undefined, () => undefined);
    return request;
  };

  // Direct writers (for example signup) can invalidate only the intended user.
  const invalidate = (userId: string, expectedGeneration = generation) => {
    if (owner?.id !== userId || !isCurrent(expectedGeneration)) return Promise.resolve(null);
    revision += 1;
    loaded = false;
    inFlight = null;
    return refetch();
  };

  // Focus/visibility/online events can arrive together. Bound background
  // revalidation, including failures, without adding a polling timer.
  const revalidate = (reconnected = false) => {
    if (inFlight) return inFlight;
    // A failed first load has no usable profile to retain. An actual network
    // reconnect must recover immediately even inside the focus throttle window.
    if (reconnected && !snapshot.profile && snapshot.error) return refetch();
    return now() - lastCheckedAt < PROFILE_REVALIDATE_INTERVAL_MS
      ? Promise.resolve(snapshot.profile)
      : refetch();
  };

  return {
    activate, ensure, refetch, update, invalidate, revalidate,
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
