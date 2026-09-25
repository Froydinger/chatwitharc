export interface BrowserbaseCdpConnection {
  send(method: string, params?: Record<string, unknown>, sessionId?: string): Promise<unknown>;
  on(method: string, listener: (params: Record<string, unknown>) => void): () => void;
  close(): void;
}

export type BrowserbaseCdpConnector = (connectUrl: string) => Promise<BrowserbaseCdpConnection>;

function isBrowserbaseHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === 'browserbase.com' || normalized.endsWith('.browserbase.com');
}

type CdpMessage = {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  sessionId?: string;
  result?: unknown;
  error?: { message?: string; code?: number };
};

/** Connect to a Browserbase-provided CDP endpoint without exposing its bearer URL. */
export const connectBrowserbaseCdp: BrowserbaseCdpConnector = async (connectUrl) => {
  const endpoint = new URL(connectUrl);
  if (endpoint.protocol !== 'wss:' || !isBrowserbaseHost(endpoint.hostname)) {
    throw new Error('Browser session connection is unavailable');
  }

  const socket = new WebSocket(endpoint);
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason: Error) => void }>();
  const listeners = new Map<string, Set<(params: Record<string, unknown>) => void>>();
  let nextId = 1;
  let opened = false;
  let closed = false;

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Browser session connection timed out')), 8_000);
    socket.addEventListener('open', () => {
      opened = true;
      clearTimeout(timer);
      resolve();
    }, { once: true });
    socket.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('Browser session connection failed'));
    }, { once: true });
  });

  const rejectPending = () => {
    if (closed) return;
    closed = true;
    for (const command of pending.values()) command.reject(new Error('Browser session connection closed'));
    pending.clear();
    listeners.clear();
  };

  socket.addEventListener('message', (event) => {
    if (typeof event.data !== 'string') return;
    let message: CdpMessage;
    try {
      message = JSON.parse(event.data) as CdpMessage;
    } catch {
      return;
    }
    if (typeof message.id === 'number') {
      const command = pending.get(message.id);
      if (!command) return;
      pending.delete(message.id);
      if (message.error) command.reject(new Error('Browser command failed'));
      else command.resolve(message.result);
      return;
    }
    if (message.method) {
      for (const listener of listeners.get(message.method) ?? []) {
        listener(message.params ?? {});
      }
    }
  });
  socket.addEventListener('close', rejectPending, { once: true });
  socket.addEventListener('error', rejectPending, { once: true });

  return {
    send(method, params = {}, sessionId) {
      if (!opened || closed || socket.readyState !== WebSocket.OPEN) {
        return Promise.reject(new Error('Browser session connection closed'));
      }
      const id = nextId++;
      const payload = sessionId ? { id, method, params, sessionId } : { id, method, params };
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error('Browser command timed out'));
        }, 8_000);
        pending.set(id, {
          resolve: value => { clearTimeout(timer); resolve(value); },
          reject: error => { clearTimeout(timer); reject(error); },
        });
        try {
          socket.send(JSON.stringify(payload));
        } catch {
          pending.delete(id);
          clearTimeout(timer);
          reject(new Error('Browser command failed'));
        }
      });
    },
    on(method, listener) {
      const set = listeners.get(method) ?? new Set();
      set.add(listener);
      listeners.set(method, set);
      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(method);
      };
    },
    close() {
      rejectPending();
      try { socket.close(); } catch { /* already closed */ }
    },
  };
};

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

async function pageSession(connection: BrowserbaseCdpConnection): Promise<string> {
  const targetsResult = await connection.send('Target.getTargets') as { targetInfos?: Array<Record<string, unknown>> };
  const target = targetsResult?.targetInfos?.find(item => item.type === 'page');
  const targetId = typeof target?.targetId === 'string'
    ? target.targetId
    : (await connection.send('Target.createTarget', { url: 'about:blank' }) as { targetId?: string }).targetId;
  if (!targetId) throw new Error('Browser page is unavailable');
  const attached = await connection.send('Target.attachToTarget', { targetId, flatten: true }) as { sessionId?: string };
  const sessionId = attached?.sessionId;
  if (!sessionId) throw new Error('Browser page is unavailable');
  await connection.send('Page.enable', {}, sessionId);
  await connection.send('Runtime.enable', {}, sessionId);
  return sessionId;
}

async function evaluateValue(connection: BrowserbaseCdpConnection, sessionId: string, expression: string): Promise<unknown> {
  const result = await connection.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  }, sessionId) as { exceptionDetails?: unknown; result?: { value?: unknown } };
  if (result?.exceptionDetails) throw new Error('Browser action failed');
  return result?.result?.value;
}

async function readSnapshot(connection: BrowserbaseCdpConnection, sessionId: string): Promise<BrowserbasePageSnapshot> {
  const value = await evaluateValue(connection, sessionId,
    'JSON.stringify({title:document.title||"",url:location.href||"",text:(document.body?.innerText||"").slice(0,12000)})');
  if (typeof value !== 'string') throw new Error('Browser page is unavailable');
  const snapshot = JSON.parse(value) as Record<string, unknown>;
  if (typeof snapshot.title !== 'string' || typeof snapshot.url !== 'string' || typeof snapshot.text !== 'string') {
    throw new Error('Browser page is unavailable');
  }
  return {
    title: snapshot.title.slice(0, 300),
    url: snapshot.url.slice(0, 2048),
    text: snapshot.text.slice(0, 12_000),
  };
}

/** Navigate one validated public URL and collect only a bounded visible-text snapshot. */
export async function navigateBrowserbasePage(
  connectUrl: string,
  targetUrl: string,
  connector: BrowserbaseCdpConnector = connectBrowserbaseCdp,
): Promise<BrowserbasePageSnapshot> {
  const connection = await connector(connectUrl);
  try {
    const sessionId = await pageSession(connection);
    await connection.send('Page.navigate', { url: targetUrl }, sessionId);

    let lastSnapshot: BrowserbasePageSnapshot = { title: '', url: '', text: '' };
    for (let attempt = 0; attempt < 12; attempt += 1) {
      try {
        lastSnapshot = await readSnapshot(connection, sessionId);
        if (lastSnapshot.url && lastSnapshot.text) return lastSnapshot;
      } catch { /* page may still be transitioning */ }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!lastSnapshot.url) throw new Error('Page did not finish loading');
    return lastSnapshot;
  } finally {
    connection.close();
  }
}

/** Run a bounded Luna action over CDP. Session ownership/control checks live in the server backend. */
export async function actBrowserbasePage(
  connectUrl: string,
  action: BrowserbasePageAction,
  connector: BrowserbaseCdpConnector = connectBrowserbaseCdp,
): Promise<{ snapshot: BrowserbasePageSnapshot; passed?: boolean }> {
  const connection = await connector(connectUrl);
  try {
    const sessionId = await pageSession(connection);
    let passed: boolean | undefined;
    switch (action.type) {
      case 'goto':
        await connection.send('Page.navigate', { url: action.url }, sessionId);
        await new Promise(resolve => setTimeout(resolve, 500));
        break;
      case 'click': {
        const selector = JSON.stringify(action.selector);
        const clicked = await evaluateValue(connection, sessionId,
          `(()=>{const e=document.querySelector(${selector});if(!(e instanceof HTMLElement))return false;e.scrollIntoView({block:"center",inline:"center"});e.click();return true})()`);
        if (clicked !== true) throw new Error('Target element was not found');
        break;
      }
      case 'type': {
        const selector = JSON.stringify(action.selector);
        const focusState = await evaluateValue(connection, sessionId,
          `(()=>{const e=document.querySelector(${selector});if(!(e instanceof HTMLElement))return JSON.stringify({ok:false});const kind=((e.getAttribute("type")||"")+" "+(e.getAttribute("autocomplete")||"")).toLowerCase();if(/password|one-time-code/.test(kind))return JSON.stringify({ok:false,sensitive:true});e.scrollIntoView({block:"center",inline:"center"});e.focus();return JSON.stringify({ok:true})})()`);
        let focusResult: { ok?: boolean; sensitive?: boolean } = {};
        if (typeof focusState === 'string') {
          try { focusResult = JSON.parse(focusState) as { ok?: boolean; sensitive?: boolean }; } catch { /* invalid target */ }
        }
        if (focusResult.sensitive) throw new Error('Credential fields require user takeover');
        if (focusResult.ok !== true) throw new Error('Target element was not found');
        await connection.send('Input.insertText', { text: action.text }, sessionId);
        break;
      }
      case 'scroll':
        await evaluateValue(connection, sessionId, `window.scrollBy(${action.x},${action.y});true`);
        break;
      case 'wait':
        await new Promise(resolve => setTimeout(resolve, action.milliseconds));
        break;
      case 'expect': {
        const snapshot = await readSnapshot(connection, sessionId);
        const hasText = action.text === undefined || snapshot.text.includes(action.text);
        let hasSelector = true;
        if (action.selector !== undefined) {
          hasSelector = await evaluateValue(connection, sessionId,
            `(()=>{const e=document.querySelector(${JSON.stringify(action.selector)});return !!e&&(!!e.offsetWidth||!!e.offsetHeight||!!e.getClientRects().length)})()`
          ) === true;
        }
        passed = hasText && hasSelector;
        break;
      }
      case 'read_snapshot':
        break;
    }
    const snapshot = await readSnapshot(connection, sessionId);
    return { snapshot, ...(passed === undefined ? {} : { passed }) };
  } finally {
    connection.close();
  }
}
