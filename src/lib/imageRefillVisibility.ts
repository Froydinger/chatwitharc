/** Presentation only: bonuses count toward usable credit balance. */
export function imageRefillVisible({loading, isAdmin, remaining, limit}: {
  loading: boolean; isAdmin: boolean; remaining: number; limit: number;
}): boolean {
  return !loading && !isAdmin && Number.isFinite(remaining) && Number.isFinite(limit)
    && limit > 0 && remaining >= 0 && remaining <= limit * 0.1;
}
