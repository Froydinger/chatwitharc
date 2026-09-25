import {
  connectBrowserbaseCdp,
  navigateBrowserbasePage,
  actBrowserbasePage,
  type BrowserbaseCdpConnector,
  type BrowserbasePageAction,
  type BrowserbasePageSnapshot,
} from './browserbaseCdp.ts';

export const BROWSERBASE_SESSION_MAX_SECONDS = 600;
export const BROWSERBASE_SESSION_MIN_SECONDS = 60;
export const BROWSERBASE_MONTHLY_BUDGET_MINUTES = 45;
export const BROWSERBASE_MAX_CONCURRENT_SESSIONS = 3;
const BROWSERBASE_API = 'https://api.browserbase.com/v1';
const SESSION_HANDLE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_RE = SESSION_HANDLE_RE;
const SENSITIVE_QUERY_KEY = /^(?:accesstoken|refreshtoken|idtoken|token|secret|password|passwd|auth|authorization|apikey|clientsecret|code|credential|signature|sig|jwt|session|csrf|state|sso|samlresponse)$/i;
const PRIVATE_SUFFIXES = [
  '.localhost', '.local', '.internal', '.lan', '.home', '.test', '.example', '.invalid', '.arpa',
];

export type BrowserbaseTaskKind = 'chat' | 'git';
export type BrowserbaseDevice = 'desktop' | 'mobile';
export type BrowserbaseControlAction = 'takeover' | 'handoff' | 'resume';
export type BrowserbaseSessionStatus =
  | 'provisioning'
  | 'agent_running'
  | 'user_control'
  | 'handed_back'
  | 'release_requested'
  | 'closed'
  | 'expired'
  | 'failed';

export interface BrowserbaseSessionRecord {
  sessionHandle: string;
  userId: string;
  providerSessionId: string | null;
  targetOrigin: string;
  allowedDomains: string[];
  taskKind: BrowserbaseTaskKind;
  device: BrowserbaseDevice;
  status: BrowserbaseSessionStatus;
  durationSeconds: number;
  reservedMinutes: number;
  createdAt: string;
  expiresAt: string;
}

export type BrowserbaseReserveResult =
  | { ok: true; reservedMinutes: number; expiresAt: string }
  | { ok: false; reason: 'quota_exhausted' | 'concurrency_limit' };

export interface BrowserbaseSessionStore {
  reserve(input: {
    sessionHandle: string;
    userId: string;
    targetOrigin: string;
    allowedDomains: string[];
    taskKind: BrowserbaseTaskKind;
    device: BrowserbaseDevice;
    repo: string | null;
    chatSessionId: string | null;
    durationSeconds: number;
  }): Promise<BrowserbaseReserveResult>;
  getOwned(sessionHandle: string, userId: string): Promise<BrowserbaseSessionRecord | null>;
  attachProviderSession(sessionHandle: string, userId: string, providerSessionId: string): Promise<boolean>;
  setControl(sessionHandle: string, userId: string, action: BrowserbaseControlAction): Promise<{
    ok: boolean;
    reason?: string;
    status?: BrowserbaseSessionStatus;
  }>;
  markReleaseRequested(sessionHandle: string, userId: string): Promise<void>;
  settle(sessionHandle: string, userId: string, status: 'closed' | 'failed', consumedMinutes: number): Promise<void>;
}

export interface BrowserbaseSessionConfig {
  enabled: string | boolean | undefined;
  apiKey?: string;
  projectId?: string;
}

export type BrowserbaseDnsLookup = (hostname: string, recordType: 'A' | 'AAAA') => Promise<string[]>;

export interface BrowserbaseCreateInput {
  targetUrl: string;
  device?: BrowserbaseDevice;
  durationSeconds?: number;
  taskKind?: BrowserbaseTaskKind;
  chatSessionId?: string;
  repo?: string;
  /** Exact additional hostnames needed for expected redirects or authentication. */
  allowedDomains?: string[];
}

export type BrowserbaseUnavailableReason =
  | 'disabled'
  | 'quota_exhausted'
  | 'concurrency_limit'
  | 'invalid_target'
  | 'session_unavailable';

export type BrowserbaseActionResult =
  | { available: false; reason: BrowserbaseUnavailableReason }
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

export interface BrowserbaseBackendOptions {
  store: BrowserbaseSessionStore;
  fetcher?: typeof fetch;
  dnsLookup?: BrowserbaseDnsLookup;
  cdpConnector?: BrowserbaseCdpConnector;
  now?: () => number;
}

export class BrowserbaseTargetError extends Error {
  constructor() {
    super('Browser session target must be a public HTTPS URL without embedded secrets.');
    this.name = 'BrowserbaseTargetError';
  }
}

class BrowserbaseHttpError extends Error {
  constructor(readonly status: number) {
    super('Browser session provider request failed');
  }
}

function parseIpv4(hostname: string): number[] | null {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return null;
  const octets = hostname.split('.').map(Number);
  if (octets.some(value => value < 0 || value > 255)) return null;
  return octets;
}

function isPublicIpv4(hostname: string): boolean {
  const octets = parseIpv4(hostname);
  if (!octets) return false;
  const [a, b, c] = octets;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && c === 0) return false;
  if (a === 192 && b === 0 && c === 2) return false;
  if (a === 192 && b === 88 && c === 99) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function parseIpv6(hostname: string): number[] | null {
  let host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host.includes(':')) return null;
  const lastColon = host.lastIndexOf(':');
  const dottedTail = host.slice(lastColon + 1);
  if (dottedTail.includes('.')) {
    const octets = parseIpv4(dottedTail);
    if (!octets) return null;
    const hi = ((octets[0] << 8) | octets[1]).toString(16);
    const lo = ((octets[2] << 8) | octets[3]).toString(16);
    host = `${host.slice(0, lastColon + 1)}${hi}:${lo}`;
  }
  const halves = host.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  const groups = [...left, ...Array(missing).fill('0'), ...right];
  if (groups.length !== 8 || groups.some(group => !/^[a-f0-9]{1,4}$/i.test(group))) return null;
  return groups.map(group => Number.parseInt(group, 16));
}

function isPublicIpv6(hostname: string): boolean {
  const groups = parseIpv6(hostname);
  if (!groups) return false;
  if (groups.slice(0, 5).every(group => group === 0) && groups[5] === 0xffff) {
    const mappedIpv4 = `${groups[6] >> 8}.${groups[6] & 255}.${groups[7] >> 8}.${groups[7] & 255}`;
    return isPublicIpv4(mappedIpv4);
  }
  const first = groups[0];
  // Only global-unicast space is accepted. This rejects unspecified, loopback,
  // ULA, link-local, multicast and the reserved special-purpose ranges.
  if ((first & 0xe000) !== 0x2000) return false;
  if (first === 0x2001 && (groups[1] <= 0x01ff || groups[1] === 0x0db8 || groups[1] === 0x0020)) return false;
  if (first === 0x2002) return false; // 6to4 embeds an IPv4 address.
  return true;
}

function hostnameKind(hostname: string): 'ipv4' | 'ipv6' | 'name' {
  if (parseIpv4(hostname)) return 'ipv4';
  if (hostname.includes(':')) return 'ipv6';
  return 'name';
}

function checkHostnameShape(hostname: string): void {
  const normalized = hostname.toLowerCase().replace(/\.$/, '');
  if (!normalized || normalized.length > 253 || normalized === 'localhost' ||
    PRIVATE_SUFFIXES.some(suffix => normalized.endsWith(suffix)) ||
    (hostnameKind(normalized) === 'name' && (normalized.split('.').length < 2 ||
      normalized.split('.').some(label => !label || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label))))) {
    throw new BrowserbaseTargetError();
  }
}

async function ensurePublicHostname(hostnameInput: string, dnsLookup: BrowserbaseDnsLookup): Promise<string> {
  const hostname = hostnameInput.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  checkHostnameShape(hostname);
  const kind = hostnameKind(hostname);
  if (kind === 'ipv4') {
    if (!isPublicIpv4(hostname)) throw new BrowserbaseTargetError();
    return hostname;
  }
  if (kind === 'ipv6') {
    if (!isPublicIpv6(hostname)) throw new BrowserbaseTargetError();
    return hostname;
  }
  const resolved = await Promise.all(['A', 'AAAA'].map(async type => {
    try { return await dnsLookup(hostname, type as 'A' | 'AAAA'); }
    catch { return []; }
  }));
  const addresses = resolved.flat();
  if (addresses.length === 0 || addresses.some(address => {
    const value = address.toLowerCase().replace(/^\[|\]$/g, '');
    return value.includes(':') ? !isPublicIpv6(value) : !isPublicIpv4(value);
  })) throw new BrowserbaseTargetError();
  return hostname;
}

/** Reject private/local targets and URLs likely to carry credentials in query or fragments. */
export async function validateBrowserbaseTargetUrl(
  rawUrl: string,
  dnsLookup: BrowserbaseDnsLookup,
): Promise<{ url: URL; origin: string; hostname: string }> {
  if (typeof rawUrl !== 'string' || rawUrl.length < 8 || rawUrl.length > 2048) throw new BrowserbaseTargetError();
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new BrowserbaseTargetError(); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443' || hasSensitiveFragment(url.hash)) {
    throw new BrowserbaseTargetError();
  }
  const hostname = await ensurePublicHostname(url.hostname, dnsLookup);
  for (const key of url.searchParams.keys()) {
    if (isSensitiveQueryKey(key)) throw new BrowserbaseTargetError();
  }
  return { url, origin: url.origin, hostname };
}

async function validateAllowedDomains(
  input: string[] | undefined,
  primaryHostname: string,
  dnsLookup: BrowserbaseDnsLookup,
): Promise<string[]> {
  if (input !== undefined && (!Array.isArray(input) || input.length > 8)) throw new BrowserbaseTargetError();
  const domains = new Set([primaryHostname]);
  for (const candidate of input ?? []) {
    if (typeof candidate !== 'string' || candidate.length > 253 || candidate.includes('/') || candidate.includes('@') || candidate.includes('*')) {
      throw new BrowserbaseTargetError();
    }
    const hostname = await ensurePublicHostname(candidate, dnsLookup);
    domains.add(hostname);
  }
  return [...domains];
}

async function sanitizePageSnapshot(
  snapshot: BrowserbasePageSnapshot,
  allowedDomains: string[],
  dnsLookup: BrowserbaseDnsLookup,
): Promise<BrowserbasePageSnapshot> {
  let url: URL;
  try { url = new URL(snapshot.url); } catch { throw new BrowserbaseTargetError(); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new BrowserbaseTargetError();
  const hostname = await ensurePublicHostname(url.hostname, dnsLookup);
  if (!allowedDomains.includes(hostname)) throw new BrowserbaseTargetError();
  for (const key of [...url.searchParams.keys()]) {
    if (isSensitiveQueryKey(key)) url.searchParams.delete(key);
  }
  url.hash = '';
  return { ...snapshot, url: url.toString().slice(0, 2048), text: snapshot.text.slice(0, 12_000) };
}

function safeRepo(repo: unknown): string | null {
  if (repo === undefined || repo === null || repo === '') return null;
  if (typeof repo !== 'string' || repo.length > 200 || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new Error('Invalid repository reference');
  }
  return repo;
}

function safeChatSessionId(chatSessionId: unknown): string | null {
  if (chatSessionId === undefined || chatSessionId === null || chatSessionId === '') return null;
  if (typeof chatSessionId !== 'string' || !UUID_RE.test(chatSessionId)) throw new Error('Invalid chat session reference');
  return chatSessionId;
}

function isEnabled(config: BrowserbaseSessionConfig): config is BrowserbaseSessionConfig & { apiKey: string } {
  return config.enabled === true || config.enabled === 'true'
    ? typeof config.apiKey === 'string' && config.apiKey.trim().length > 0
    : false;
}

function activeRecord(record: BrowserbaseSessionRecord, now: number): boolean {
  return ['provisioning', 'agent_running', 'user_control', 'handed_back', 'release_requested'].includes(record.status) &&
    Date.parse(record.expiresAt) > now;
}

function isBrowserbaseHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === 'browserbase.com' || normalized.endsWith('.browserbase.com');
}

function isSensitiveQueryKey(key: string): boolean {
  return SENSITIVE_QUERY_KEY.test(key.toLowerCase().replace(/[^a-z0-9]/g, ''));
}

function hasSensitiveFragment(hash: string): boolean {
  if (!hash) return false;
  let fragment: string;
  try { fragment = decodeURIComponent(hash.slice(1)); } catch { return true; }
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(fragment)) return true;
  const pairs = fragment.replace(/^\?/, '').split(/[&;]/).map(part => part.split('=', 1)[0]);
  return pairs.some(isSensitiveQueryKey);
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  if (!response.ok) throw new BrowserbaseHttpError(response.status);
  const data = await response.json().catch(() => null);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid browser session provider response');
  return data as Record<string, unknown>;
}

function validateProviderUrl(raw: unknown, protocol: 'https:' | 'wss:'): string {
  if (typeof raw !== 'string') throw new Error('Invalid browser session provider response');
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('Invalid browser session provider response'); }
  if (url.protocol !== protocol || url.username || url.password || !isBrowserbaseHost(url.hostname)) {
    throw new Error('Invalid browser session provider response');
  }
  return url.toString();
}

function elapsedMinutes(createdAt: string, endedAt?: unknown, now = Date.now()): number {
  const start = Date.parse(createdAt);
  const parsedEnd = typeof endedAt === 'string' ? Date.parse(endedAt) : NaN;
  const end = Number.isFinite(parsedEnd) ? parsedEnd : now;
  return Math.max(0, Math.ceil((end - start) / 60_000));
}

export function createBrowserbaseSessionBackend(
  config: BrowserbaseSessionConfig,
  options: BrowserbaseBackendOptions,
) {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now;
  const dnsLookup = options.dnsLookup ?? (async () => { throw new Error('DNS lookup unavailable'); });
  const cdpConnector = options.cdpConnector ?? connectBrowserbaseCdp;
  const apiKey = config.apiKey?.trim() ?? '';

  const requestJson = async (url: string, init: RequestInit = {}) => {
    try {
      const response = await fetcher(url, {
        ...init,
        headers: { 'X-BB-API-Key': apiKey, ...(init.headers as Record<string, string> | undefined) },
        signal: init.signal ?? AbortSignal.timeout(12_000),
        redirect: 'error',
      });
      return await readJson(response);
    } catch (error) {
      if (error instanceof BrowserbaseHttpError) throw error;
      throw new Error('Browser session provider is unavailable');
    }
  };

  const getProviderSession = async (providerSessionId: string) => requestJson(
    `${BROWSERBASE_API}/sessions/${encodeURIComponent(providerSessionId)}`,
  );

  const getLiveViewUrl = async (providerSessionId: string): Promise<string> => {
    const response = await requestJson(`${BROWSERBASE_API}/sessions/${encodeURIComponent(providerSessionId)}/debug`);
    return validateProviderUrl(response.debuggerFullscreenUrl, 'https:');
  };

  const requestRelease = async (providerSessionId: string) => requestJson(
    `${BROWSERBASE_API}/sessions/${encodeURIComponent(providerSessionId)}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'REQUEST_RELEASE' }) },
  );

  const markReleasedWhenConfirmed = async (record: BrowserbaseSessionRecord, providerStatus: Record<string, unknown>) => {
    const status = typeof providerStatus.status === 'string' ? providerStatus.status.toUpperCase() : '';
    if (['COMPLETED', 'TIMED_OUT', 'ERROR'].includes(status)) {
      await options.store.settle(record.sessionHandle, record.userId, status === 'ERROR' ? 'failed' : 'closed',
        elapsedMinutes(record.createdAt, providerStatus.endedAt, now()));
      return true;
    }
    await options.store.markReleaseRequested(record.sessionHandle, record.userId);
    return false;
  };

  async function unavailable(reason: BrowserbaseUnavailableReason): Promise<BrowserbaseActionResult> {
    return { available: false, reason };
  }

  async function create(userId: string, input: BrowserbaseCreateInput): Promise<BrowserbaseActionResult> {
    if (!isEnabled(config)) return unavailable('disabled');
    if (typeof userId !== 'string' || !UUID_RE.test(userId)) return unavailable('session_unavailable');
    if (!input || typeof input !== 'object') return unavailable('invalid_target');

    let validated: Awaited<ReturnType<typeof validateBrowserbaseTargetUrl>>;
    let allowedDomains: string[];
    try {
      validated = await validateBrowserbaseTargetUrl(input.targetUrl, dnsLookup);
      allowedDomains = await validateAllowedDomains(input.allowedDomains, validated.hostname, dnsLookup);
    } catch { return unavailable('invalid_target'); }

    if ((input.device !== undefined && input.device !== 'desktop' && input.device !== 'mobile') ||
      (input.taskKind !== undefined && input.taskKind !== 'chat' && input.taskKind !== 'git')) {
      return unavailable('session_unavailable');
    }
    const device: BrowserbaseDevice = input.device === 'mobile' ? 'mobile' : 'desktop';
    const taskKind: BrowserbaseTaskKind = input.taskKind === 'git' ? 'git' : 'chat';
    const durationSeconds = input.durationSeconds ?? 300;
    if (!Number.isSafeInteger(durationSeconds) || durationSeconds < BROWSERBASE_SESSION_MIN_SECONDS ||
      durationSeconds > BROWSERBASE_SESSION_MAX_SECONDS) return unavailable('session_unavailable');

    let repo: string | null;
    let chatSessionId: string | null;
    try {
      repo = safeRepo(input.repo);
      chatSessionId = safeChatSessionId(input.chatSessionId);
    } catch { return unavailable('session_unavailable'); }

    const sessionHandle = crypto.randomUUID();
    const reservation = await options.store.reserve({
      sessionHandle,
      userId,
      targetOrigin: validated.origin,
      allowedDomains,
      taskKind,
      device,
      repo,
      chatSessionId,
      durationSeconds,
    });
    if (!reservation.ok) return unavailable(reservation.reason);

    const viewport = device === 'mobile'
      ? { width: 360, height: 800 }
      : { width: 1365, height: 768 };
    let created: Record<string, unknown>;
    try {
      created = await requestJson(`${BROWSERBASE_API}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(config.projectId ? { projectId: config.projectId } : {}),
          timeout: durationSeconds,
          keepAlive: false,
          browserSettings: {
            viewport,
            allowedDomains,
            recordSession: false,
            logSession: false,
          },
          userMetadata: { product: 'Arc', sessionHandle, taskKind, device },
        }),
      });
    } catch (error) {
      // A 4xx is a confirmed rejection. A timeout, network error, or 5xx could
      // have created a session, so keep the reservation until its hard expiry.
      if (error instanceof BrowserbaseHttpError && error.status >= 400 && error.status < 500) {
        await options.store.settle(sessionHandle, userId, 'failed', 0).catch(() => {});
      }
      if (error instanceof BrowserbaseHttpError && (error.status === 402 || error.status === 429)) {
        return unavailable('quota_exhausted');
      }
      return unavailable('session_unavailable');
    }

    const providerSessionId = typeof created.id === 'string' ? created.id : '';
    let connectUrl: string;
    try { connectUrl = validateProviderUrl(created.connectUrl, 'wss:'); }
    catch {
      if (providerSessionId) {
        await requestRelease(providerSessionId).catch(() => {});
        await options.store.markReleaseRequested(sessionHandle, userId).catch(() => {});
      }
      return unavailable('session_unavailable');
    }
    if (!providerSessionId || !/^[A-Za-z0-9_-]{1,200}$/.test(providerSessionId)) {
      return unavailable('session_unavailable');
    }

    const attached = await options.store.attachProviderSession(sessionHandle, userId, providerSessionId).catch(() => false);
    if (!attached) {
      await requestRelease(providerSessionId).catch(() => {});
      return unavailable('session_unavailable');
    }

    let pageSnapshot: BrowserbasePageSnapshot;
    try {
      pageSnapshot = await navigateBrowserbasePage(connectUrl, validated.url.toString(), cdpConnector);
      pageSnapshot = await sanitizePageSnapshot(pageSnapshot, allowedDomains, dnsLookup);
    } catch {
      await requestRelease(providerSessionId).catch(() => {});
      const status = await getProviderSession(providerSessionId).catch(() => null);
      if (status) await markReleasedWhenConfirmed({
        sessionHandle, userId, providerSessionId, targetOrigin: validated.origin, allowedDomains, taskKind, device,
        status: 'release_requested', durationSeconds, reservedMinutes: reservation.reservedMinutes,
        createdAt: new Date(now()).toISOString(), expiresAt: reservation.expiresAt,
      }, status).catch(() => {});
      else await options.store.markReleaseRequested(sessionHandle, userId).catch(() => {});
      return unavailable('session_unavailable');
    }

    let liveViewUrl: string;
    try { liveViewUrl = await getLiveViewUrl(providerSessionId); }
    catch {
      await requestRelease(providerSessionId).catch(() => {});
      await options.store.markReleaseRequested(sessionHandle, userId).catch(() => {});
      return unavailable('session_unavailable');
    }

    return {
      available: true,
      sessionHandle,
      status: 'agent_running',
      expiresAt: new Date(now() + durationSeconds * 1000).toISOString(),
      liveViewUrl,
      device,
      control: device === 'mobile' ? 'view_only' : 'agent',
      pageSnapshot,
    };
  }

  async function getFreshView(userId: string, sessionHandle: string, takeover = false): Promise<BrowserbaseActionResult> {
    if (!isEnabled(config)) return unavailable('disabled');
    if (!SESSION_HANDLE_RE.test(sessionHandle)) return unavailable('session_unavailable');
    const record = await options.store.getOwned(sessionHandle, userId).catch(() => null);
    if (!record || !record.providerSessionId || !activeRecord(record, now())) return unavailable('session_unavailable');
    if (takeover && record.device === 'mobile') return unavailable('session_unavailable');

    let liveViewUrl: string;
    try { liveViewUrl = await getLiveViewUrl(record.providerSessionId); }
    catch { return unavailable('session_unavailable'); }

    if (takeover) {
      const transition = await options.store.setControl(sessionHandle, userId, 'takeover').catch(() => ({ ok: false }));
      if (!transition.ok) return unavailable('session_unavailable');
      return {
        available: true,
        sessionHandle,
        status: 'user_control',
        expiresAt: record.expiresAt,
        liveViewUrl,
        device: record.device,
        control: 'user',
      };
    }
    return {
      available: true,
      sessionHandle,
      status: record.status,
      expiresAt: record.expiresAt,
      liveViewUrl,
      device: record.device,
      control: record.device === 'mobile' ? 'view_only' : record.status === 'user_control' ? 'user' : 'agent',
    };
  }

  async function control(
    userId: string,
    sessionHandle: string,
    action: BrowserbaseControlAction,
  ): Promise<BrowserbaseActionResult> {
    if (!isEnabled(config)) return unavailable('disabled');
    if (!SESSION_HANDLE_RE.test(sessionHandle)) return unavailable('session_unavailable');
    const record = await options.store.getOwned(sessionHandle, userId).catch(() => null);
    if (!record || !record.providerSessionId || !activeRecord(record, now())) return unavailable('session_unavailable');
    if (record.device === 'mobile' && action !== 'resume') return unavailable('session_unavailable');
    const transition: { ok: boolean; reason?: string; status?: BrowserbaseSessionStatus } =
      await options.store.setControl(sessionHandle, userId, action).catch(() => ({ ok: false }));
    if (!transition.ok) return unavailable('session_unavailable');
    return {
      available: true,
      sessionHandle,
      status: transition.status ?? (action === 'takeover' ? 'user_control' : action === 'handoff' ? 'handed_back' : 'agent_running'),
      expiresAt: record.expiresAt,
      device: record.device,
      control: action === 'takeover' ? 'user' : action === 'handoff' ? 'agent' : 'agent',
      ...(action === 'handoff' ? { handoffEvent: { type: 'browser_session_handoff' as const, sessionHandle } } : {}),
    };
  }

  async function close(userId: string, sessionHandle: string): Promise<BrowserbaseActionResult> {
    if (!isEnabled(config)) return unavailable('disabled');
    if (!SESSION_HANDLE_RE.test(sessionHandle)) return unavailable('session_unavailable');
    const record = await options.store.getOwned(sessionHandle, userId).catch(() => null);
    if (!record || !record.providerSessionId) return unavailable('session_unavailable');
    try {
      await requestRelease(record.providerSessionId);
      const providerStatus = await getProviderSession(record.providerSessionId);
      await markReleasedWhenConfirmed(record, providerStatus);
    } catch {
      await options.store.markReleaseRequested(sessionHandle, userId).catch(() => {});
    }
    return {
      available: true,
      sessionHandle,
      status: 'release_requested',
      expiresAt: record.expiresAt,
      device: record.device,
      control: 'view_only',
    };
  }

  async function act(
    userId: string,
    sessionHandle: string,
    action: BrowserbasePageAction,
  ): Promise<BrowserbaseActionResult> {
    if (!isEnabled(config)) return unavailable('disabled');
    if (!SESSION_HANDLE_RE.test(sessionHandle)) return unavailable('session_unavailable');
    const record = await options.store.getOwned(sessionHandle, userId).catch(() => null);
    if (!record || !record.providerSessionId || !activeRecord(record, now()) ||
      !['agent_running', 'handed_back'].includes(record.status)) return unavailable('session_unavailable');

    let normalizedAction: BrowserbasePageAction;
    try {
      switch (action?.type) {
        case 'goto': {
          const target = await validateBrowserbaseTargetUrl(action.url, dnsLookup);
          if (!record.allowedDomains.includes(target.hostname)) throw new BrowserbaseTargetError();
          normalizedAction = { type: 'goto', url: target.url.toString() };
          break;
        }
        case 'click':
          if (typeof action.selector !== 'string' || !action.selector.trim() || action.selector.length > 500) throw new Error('Invalid selector');
          normalizedAction = { type: 'click', selector: action.selector };
          break;
        case 'type':
          if (typeof action.selector !== 'string' || !action.selector.trim() || action.selector.length > 500 ||
            typeof action.text !== 'string' || action.text.length > 2000) throw new Error('Invalid text action');
          normalizedAction = { type: 'type', selector: action.selector, text: action.text };
          break;
        case 'scroll':
          if (!Number.isInteger(action.x) || !Number.isInteger(action.y) || Math.abs(action.x) > 2000 || Math.abs(action.y) > 2000) {
            throw new Error('Invalid scroll action');
          }
          normalizedAction = { type: 'scroll', x: action.x, y: action.y };
          break;
        case 'wait':
          if (!Number.isInteger(action.milliseconds) || action.milliseconds < 0 || action.milliseconds > 5000) throw new Error('Invalid wait');
          normalizedAction = { type: 'wait', milliseconds: action.milliseconds };
          break;
        case 'expect':
          if ((action.text !== undefined && (typeof action.text !== 'string' || action.text.length > 4000)) ||
            (action.selector !== undefined && (typeof action.selector !== 'string' || !action.selector.trim() || action.selector.length > 500)) ||
            (action.text === undefined && action.selector === undefined)) throw new Error('Invalid expectation');
          normalizedAction = {
            type: 'expect',
            ...(action.text === undefined ? {} : { text: action.text }),
            ...(action.selector === undefined ? {} : { selector: action.selector }),
          };
          break;
        case 'read_snapshot':
          normalizedAction = { type: 'read_snapshot' };
          break;
        default:
          throw new Error('Unsupported action');
      }
    } catch { return unavailable('invalid_target'); }

    const providerSession = await getProviderSession(record.providerSessionId).catch(() => null);
    if (!providerSession) return unavailable('session_unavailable');
    let connectUrl: string;
    try { connectUrl = validateProviderUrl(providerSession.connectUrl, 'wss:'); }
    catch { return unavailable('session_unavailable'); }
    try {
      const result = await actBrowserbasePage(connectUrl, normalizedAction, cdpConnector);
      const snapshot = await sanitizePageSnapshot(result.snapshot, record.allowedDomains, dnsLookup);
      return {
        available: true,
        sessionHandle,
        status: record.status,
        expiresAt: record.expiresAt,
        device: record.device,
        control: 'agent',
        pageSnapshot: snapshot,
        ...(result.passed === undefined ? {} : { pageCheckPassed: result.passed }),
      };
    } catch {
      return unavailable('session_unavailable');
    }
  }

  async function getConnectionUrl(userId: string, sessionHandle: string): Promise<string | null> {
    if (!isEnabled(config) || !SESSION_HANDLE_RE.test(sessionHandle)) return null;
    const record = await options.store.getOwned(sessionHandle, userId).catch(() => null);
    if (!record || !record.providerSessionId || !['agent_running', 'handed_back'].includes(record.status) || !activeRecord(record, now())) return null;
    const providerSession = await getProviderSession(record.providerSessionId).catch(() => null);
    if (!providerSession) return null;
    try { return validateProviderUrl(providerSession.connectUrl, 'wss:'); }
    catch { return null; }
  }

  return {
    create,
    view: getFreshView,
    takeover: (userId: string, sessionHandle: string) => getFreshView(userId, sessionHandle, true),
    control,
    close,
    act,
    /** Server-only: call from trusted Luna/Playwright code; never return this value to a browser client. */
    getBrowserbaseConnectionUrl: getConnectionUrl,
  };
}
