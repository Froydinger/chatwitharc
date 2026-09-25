import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import type {
  BrowserbaseControlAction,
  BrowserbaseDevice,
  BrowserbaseSessionRecord,
  BrowserbaseSessionStore,
  BrowserbaseTaskKind,
} from './browserbaseSessions.ts';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function mapRecord(value: unknown): BrowserbaseSessionRecord | null {
  const row = asRecord(value);
  if (!row || typeof row.session_handle !== 'string' || typeof row.user_id !== 'string' ||
    typeof row.target_origin !== 'string' || typeof row.task_kind !== 'string' ||
    typeof row.device !== 'string' || typeof row.status !== 'string' ||
    typeof row.duration_seconds !== 'number' || typeof row.reserved_minutes !== 'number' ||
    typeof row.created_at !== 'string' || typeof row.expires_at !== 'string') return null;
  return {
    sessionHandle: row.session_handle,
    userId: row.user_id,
    providerSessionId: typeof row.provider_session_id === 'string' ? row.provider_session_id : null,
    targetOrigin: row.target_origin,
    allowedDomains: Array.isArray(row.allowed_domains)
      ? row.allowed_domains.filter((domain): domain is string => typeof domain === 'string')
      : [],
    taskKind: row.task_kind as BrowserbaseTaskKind,
    device: row.device as BrowserbaseDevice,
    status: row.status as BrowserbaseSessionRecord['status'],
    durationSeconds: row.duration_seconds,
    reservedMinutes: row.reserved_minutes,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export function browserbaseSessionStore(db: SupabaseClient): BrowserbaseSessionStore {
  return {
    async reserve(input) {
      const { data, error } = await db.rpc('reserve_browserbase_session', {
        p_session_handle: input.sessionHandle,
        p_user_id: input.userId,
        p_target_origin: input.targetOrigin,
        p_allowed_domains: input.allowedDomains,
        p_task_kind: input.taskKind,
        p_device: input.device,
        p_repo: input.repo,
        p_chat_session_id: input.chatSessionId,
        p_duration_seconds: input.durationSeconds,
      });
      if (error) throw new Error('Browser session quota reservation failed');
      const result = asRecord(data);
      if (!result) throw new Error('Browser session quota reservation failed');
      if (result.ok === false && (result.reason === 'quota_exhausted' || result.reason === 'concurrency_limit')) {
        return { ok: false, reason: result.reason };
      }
      if (result.ok !== true || typeof result.reservedMinutes !== 'number' || typeof result.expiresAt !== 'string') {
        throw new Error('Browser session quota reservation failed');
      }
      return { ok: true, reservedMinutes: result.reservedMinutes, expiresAt: result.expiresAt };
    },

    async getOwned(sessionHandle, userId) {
      const { data, error } = await db.from('browserbase_sessions')
        .select('session_handle,user_id,provider_session_id,target_origin,allowed_domains,task_kind,device,status,duration_seconds,reserved_minutes,created_at,expires_at')
        .eq('session_handle', sessionHandle)
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw new Error('Browser session is unavailable');
      return mapRecord(data);
    },

    async attachProviderSession(sessionHandle, userId, providerSessionId) {
      const { data, error } = await db.from('browserbase_sessions')
        .update({ provider_session_id: providerSessionId, status: 'agent_running', updated_at: new Date().toISOString() })
        .eq('session_handle', sessionHandle)
        .eq('user_id', userId)
        .eq('status', 'provisioning')
        .select('session_handle')
        .maybeSingle();
      if (error) throw new Error('Browser session is unavailable');
      return !!data;
    },

    async setControl(sessionHandle, userId, action: BrowserbaseControlAction) {
      const { data, error } = await db.rpc('set_browserbase_session_control', {
        p_session_handle: sessionHandle,
        p_user_id: userId,
        p_action: action,
      });
      if (error) throw new Error('Browser session is unavailable');
      const result = asRecord(data);
      return {
        ok: result?.ok === true,
        ...(typeof result?.reason === 'string' ? { reason: result.reason } : {}),
        ...(typeof result?.status === 'string' ? { status: result.status as BrowserbaseSessionRecord['status'] } : {}),
      };
    },

    async markReleaseRequested(sessionHandle, userId) {
      const { error } = await db.from('browserbase_sessions')
        .update({ status: 'release_requested', updated_at: new Date().toISOString() })
        .eq('session_handle', sessionHandle)
        .eq('user_id', userId)
        .in('status', ['provisioning', 'agent_running', 'user_control', 'handed_back', 'release_requested']);
      if (error) throw new Error('Browser session is unavailable');
    },

    async settle(sessionHandle, userId, status, consumedMinutes) {
      const { data, error } = await db.rpc('settle_browserbase_session', {
        p_session_handle: sessionHandle,
        p_user_id: userId,
        p_status: status,
        p_consumed_minutes: consumedMinutes,
      });
      if (error || asRecord(data)?.ok !== true) throw new Error('Browser session usage could not be settled');
    },
  };
}
