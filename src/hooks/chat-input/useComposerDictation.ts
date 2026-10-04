import { useCallback, useEffect, useRef, useState } from 'react';
type PluginListenerHandle = { remove(): Promise<void> };
type NativeWindow = Window & { Capacitor?: {
  isNativePlatform?(): boolean; getPlatform?(): string;
  registerPlugin?(name: string): DictationPlugin;
} };

type NativeResult = { sessionId: string; text: string; isFinal: boolean };
interface DictationPlugin {
  startDictation(options: { sessionId: string; language: string }): Promise<void>;
  stopDictation(): Promise<void>;
  addListener(name: 'dictationResult', listener: (event: NativeResult) => void): Promise<PluginListenerHandle>;
  addListener(name: 'dictationError', listener: (event: { sessionId: string; message: string }) => void): Promise<PluginListenerHandle>;
}
interface BrowserRecognition {
  lang: string; continuous: boolean; interimResults: boolean;
  onstart: (() => void) | null; onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  start(): void; abort(): void;
}
type SpeechWindow = Window & {
  SpeechRecognition?: new () => BrowserRecognition;
  webkitSpeechRecognition?: new () => BrowserRecognition;
};

/** A user-started draft editor, never a Voice Mode session or a submission. */
export function useComposerDictation({ enabled, ownerKey, draft, onText, onError }: {
  enabled: boolean; ownerKey: string; draft: string;
  onText: (text: string) => void; onError: (message: string) => void;
}) {
  const [state, setState] = useState<'idle' | 'starting' | 'listening'>('idle');
  const latest = useRef({ enabled, ownerKey, draft, onText, onError });
  latest.current = { enabled, ownerKey, draft, onText, onError };
  const active = useRef<{ id: string; owner: string; prefix: string; native: boolean; plugin?: DictationPlugin } | null>(null);
  const expectedDraft = useRef(draft);
  const browser = useRef<BrowserRecognition | null>(null);
  const listeners = useRef<PluginListenerHandle[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const stop = useCallback(() => {
    const session = active.current;
    active.current = null;
    if (timer.current) clearTimeout(timer.current);
    const recognition = browser.current;
    browser.current = null;
    if (recognition) {
      recognition.onstart = recognition.onend = recognition.onerror = recognition.onresult = null;
      try { recognition.abort(); } catch { /* Already stopped. */ }
    }
    listeners.current.splice(0).forEach(handle => { void handle.remove(); });
    if (session?.plugin) void session.plugin.stopDictation().catch(() => {});
    setState('idle');
  }, []);

  const start = useCallback(async () => {
    if (active.current) { stop(); return; }
    const current = latest.current;
    if (!current.enabled) return;
    const id = crypto.randomUUID();
    const cap = (window as NativeWindow).Capacitor;
    const native = cap?.isNativePlatform?.() === true && cap?.getPlatform?.() === 'ios';
    const plugin = native ? cap?.registerPlugin?.('ArcNative') : undefined;
    if (native && !plugin) { current.onError('Update ArcAI to use Work dictation.'); return; }
    const session = { id, owner: current.ownerKey, prefix: current.draft, native, plugin };
    active.current = session;
    expectedDraft.current = current.draft;
    setState('starting');
    const owns = () => active.current?.id === id && latest.current.enabled && latest.current.ownerKey === session.owner;
    const apply = (text: string) => {
      if (!owns()) return;
      const separator = session.prefix && !/\s$/.test(session.prefix) && text ? ' ' : '';
      expectedDraft.current = session.prefix + separator + text;
      latest.current.onText(expectedDraft.current);
    };
    const fail = (message: string) => { if (owns()) { stop(); latest.current.onError(message); } };
    timer.current = setTimeout(stop, 60_000);
    try {
      if (native && plugin) {
        const result = await plugin.addListener('dictationResult', event => {
          if (event.sessionId !== id || !owns()) return;
          apply(event.text);
          if (event.isFinal) stop();
        });
        if (!owns()) { await result.remove(); return; }
        listeners.current.push(result);
        const error = await plugin.addListener('dictationError', event => {
          if (event.sessionId === id) fail(event.message || 'Dictation stopped. Please try again.');
        });
        if (!owns()) { await error.remove(); return; }
        listeners.current.push(error);
        await plugin.startDictation({ sessionId: id, language: navigator.language || 'en-US' });
        if (owns()) setState('listening');
      } else {
        const speech = window as SpeechWindow;
        const Recognition = speech.SpeechRecognition || speech.webkitSpeechRecognition;
        if (!Recognition) { fail('Use your keyboard’s dictation control in this browser.'); return; }
        const recognition = new Recognition();
        browser.current = recognition;
        recognition.lang = navigator.language || 'en-US';
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onstart = () => { if (owns()) setState('listening'); };
        recognition.onresult = event => apply(Array.from(event.results, result => result[0].transcript).join(' '));
        recognition.onend = () => { if (owns()) stop(); };
        recognition.onerror = event => fail(event.error === 'not-allowed'
          ? 'Allow microphone access to dictate, or use the keyboard.'
          : 'Dictation stopped. Please try again.');
        // Keep start inside the original user gesture; no permission request on mount.
        recognition.start();
      }
    } catch (error) {
      fail(error instanceof Error ? error.message : 'Dictation could not start. Please try again.');
    }
  }, [stop]);

  useEffect(() => { if (!enabled || active.current?.owner !== ownerKey) stop(); }, [enabled, ownerKey, stop]);
  useEffect(() => { if (active.current && draft !== expectedDraft.current) stop(); }, [draft, stop]);
  useEffect(() => {
    const onVisibility = () => { if (document.hidden) stop(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', stop);
    return () => { document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('pagehide', stop); stop(); };
  }, [stop]);
  return { state, active: state !== 'idle', toggle: start, stop };
}
