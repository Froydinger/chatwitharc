import { supabase } from '@/integrations/supabase/client';

export type BrowserbaseDevice = 'desktop' | 'mobile';
export type BrowserbaseTaskKind = 'chat' | 'git';
export type BrowserbaseSessionStatus =
  | 'provisioning'
  | 'agent_running'
  | 'user_control'
  | 'handed_back'
  | 'release_requested'
  | 'closed'
  | 'expired'
  | 'failed';

export interface BrowserbasePageSnapshot {
  title: string;
  url: string;
  text: string;
}

export type BrowserbasePageAction =
  | { type: 'goto'; url: string }
  | { type: 'click'; selector: string }
  | { type: 'type'; selector: string; text: string }
  | { type: 'scroll'; x: number; y: number }
  | { type: 'wait'; milliseconds: number }
  | { type: 'expect'; text?: string; selector?: string }
  | { type: 'read_snapshot' };

export type BrowserbaseActionResponse =
  | { available: false; reason: 'disabled' | 'quota_exhausted' | 'concurrency_limit' | 'invalid_target' | 'session_unavailable' }
  | {
    available: true;
    sessionHandle: string;
    status: BrowserbaseSessionStatus;
    expiresAt: string;
    liveViewUrl?: string;
    device: BrowserbaseDevice;
    control: 'agent' | 'user' | 'view_only';
    pageSnapshot?: BrowserbasePageSnapshot;
    pageCheckPassed?: boolean;
    handoffEvent?: { type: 'browser_session_handoff'; sessionHandle: string };
  };

export type BrowserbaseSessionRequest =
  | {
    action: 'create';
    targetUrl: string;
    device?: BrowserbaseDevice;
    durationSeconds?: number;
    taskKind?: BrowserbaseTaskKind;
    chatSessionId?: string;
    repo?: string;
    allowedDomains?: string[];
  }
  | { action: 'view' | 'takeover' | 'handoff' | 'resume' | 'close'; sessionHandle: string }
  | { action: 'act'; sessionHandle: string; operation: BrowserbasePageAction };

/** Calls the owner-authenticated Edge Function. Live view and CDP URLs stay ephemeral. */
export async function browserbaseSessionRequest(
  body: BrowserbaseSessionRequest,
): Promise<BrowserbaseActionResponse> {
  try {
    const { data, error } = await supabase.functions.invoke('browserbase-session', { body });
    if (error || !data || typeof data !== 'object' || typeof data.available !== 'boolean') {
      return { available: false, reason: 'session_unavailable' };
    }
    return data as BrowserbaseActionResponse;
  } catch {
    return { available: false, reason: 'session_unavailable' };
  }
}
