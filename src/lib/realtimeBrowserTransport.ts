/**
 * Browser transport for OpenAI Realtime using WebRTC.
 *
 * Audio travels over RTP in both directions. The data channel carries only
 * Realtime JSON events and deliberately exposes the small WebSocket surface
 * used by useOpenAIRealtime, which keeps the transport swap contained.
 */

export type RealtimeBrowserOutputEvent =
  | { type: 'track'; stream: MediaStream }
  | { type: 'playing' }
  | { type: 'paused' }
  | { type: 'ended' };

export interface RealtimeBrowserTransportOptions {
  endpoint?: string;
  audioConstraints?: MediaTrackConstraints;
  onOutputEvent?: (event: RealtimeBrowserOutputEvent) => void;
  onInputAmplitude?: (amplitude: number) => void;
  onOutputAmplitude?: (amplitude: number) => void;
}

const DEFAULT_ENDPOINT = 'https://api.openai.com/v1/realtime/calls';

const eventOf = (type: string): Event => {
  if (typeof Event === 'function') return new Event(type);
  return { type } as Event;
};

const messageEventOf = (data: string): MessageEvent<string> => {
  if (typeof MessageEvent === 'function') return new MessageEvent('message', { data });
  return { type: 'message', data } as MessageEvent<string>;
};

const closeEventOf = (code: number, reason: string): CloseEvent => {
  if (typeof CloseEvent === 'function') return new CloseEvent('close', { code, reason, wasClean: code === 1000 });
  return { type: 'close', code, reason, wasClean: code === 1000 } as CloseEvent;
};

export class RealtimeBrowserTransport {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly CONNECTING = RealtimeBrowserTransport.CONNECTING;
  readonly OPEN = RealtimeBrowserTransport.OPEN;
  readonly CLOSING = RealtimeBrowserTransport.CLOSING;
  readonly CLOSED = RealtimeBrowserTransport.CLOSED;
  readonly kind = 'webrtc' as const;

  readyState = RealtimeBrowserTransport.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  peerConnection: RTCPeerConnection | null = null;
  readonly audioElement: HTMLAudioElement;

  private dataChannel: RTCDataChannel | null = null;
  private localStream: MediaStream | null = null;
  private abortController = new AbortController();
  private readonly onOutputEvent?: (event: RealtimeBrowserOutputEvent) => void;
  private readonly options: RealtimeBrowserTransportOptions;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private audioRetryHandler: (() => void) | null = null;
  private closeEmitted = false;

  constructor(options: RealtimeBrowserTransportOptions = {}) {
    this.options = options;
    this.onOutputEvent = options.onOutputEvent;

    // Create the media element before permissions or negotiation. WebKit lets
    // capture-backed playback start in many cases; if autoplay is still
    // blocked, retry on the user's next interaction.
    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.setAttribute('playsinline', '');
    audio.style.display = 'none';
    document.body.appendChild(audio);
    this.audioElement = audio;
    this.audioRetryHandler = () => {
      void audio.play().then(() => this.removeAudioRetry()).catch(() => {
        // Keep the one lightweight listener for the next real interaction.
      });
    };
    document.addEventListener('pointerup', this.audioRetryHandler, { passive: true });
  }

  async connect(ephemeralKey: string, signal?: AbortSignal): Promise<this> {
    if (!ephemeralKey.trim()) throw new Error('Missing Realtime ephemeral key');
    if (this.readyState !== RealtimeBrowserTransport.CONNECTING || this.peerConnection) {
      throw new DOMException('Realtime transport has already connected or closed', 'InvalidStateError');
    }
    if (signal?.aborted) throw new DOMException('Connection cancelled', 'AbortError');

    const pc = new RTCPeerConnection();
    const dc = pc.createDataChannel('oai-events');
    let stream: MediaStream | null = null;
    this.peerConnection = pc;
    this.dataChannel = dc;
    this.bindEvents();

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: this.options.audioConstraints ?? {
          channelCount: { ideal: 1 },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      if (signal?.aborted || this.readyState !== RealtimeBrowserTransport.CONNECTING) {
        stream.getTracks().forEach((track) => track.stop());
        throw new DOMException('Connection cancelled', 'AbortError');
      }
      this.localStream = stream;
      // The caller explicitly enables the mic after session.updated so no
      // pre-configuration audio can accidentally start a turn.
      for (const track of stream.getAudioTracks()) {
        track.enabled = false;
        pc.addTrack(track, stream);
      }

      if (signal) {
        const cancel = () => this.close(1000, 'cancelled');
        signal.addEventListener('abort', cancel, { once: true });
        this.abortController.signal.addEventListener(
          'abort',
          () => signal.removeEventListener('abort', cancel),
          { once: true },
        );
      }

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const response = await fetch(this.options.endpoint ?? DEFAULT_ENDPOINT, {
        method: 'POST',
        body: pc.localDescription?.sdp ?? offer.sdp ?? '',
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          'Content-Type': 'application/sdp',
        },
        signal: this.abortController.signal,
      });

      const answerSdp = await response.text();
      if (!response.ok) {
        throw new Error(`Realtime WebRTC negotiation failed (${response.status}): ${answerSdp.slice(0, 240)}`);
      }
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
      this.startStats();
      return this;
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      // A deliberate close while permission/SDP was pending already emitted
      // its lifecycle event. Do not turn that into a second failure signal.
      if (this.readyState === RealtimeBrowserTransport.CLOSED) throw error;
      this.fail(error);
      throw error;
    }
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    if (this.readyState !== RealtimeBrowserTransport.OPEN || this.dataChannel?.readyState !== 'open') {
      throw new DOMException('Realtime data channel is not open', 'InvalidStateError');
    }
    if (typeof data !== 'string') {
      throw new TypeError('Realtime browser transport accepts JSON strings only');
    }
    this.dataChannel.send(data);
  }

  /** Ask the server to discard audio already buffered for RTP playback. */
  clearOutput(): void {
    this.send(JSON.stringify({ type: 'output_audio_buffer.clear' }));
  }

  setMuted(muted: boolean): void {
    for (const track of this.localStream?.getAudioTracks() ?? []) track.enabled = !muted;
  }

  get mediaStream(): MediaStream | null {
    return this.localStream;
  }

  close(code = 1000, reason = ''): void {
    if (this.readyState >= RealtimeBrowserTransport.CLOSING) return;
    this.readyState = RealtimeBrowserTransport.CLOSING;
    this.abortController.abort();
    if (this.statsTimer) clearInterval(this.statsTimer);
    this.statsTimer = null;
    this.removeAudioRetry();
    this.localStream?.getTracks().forEach((track) => track.stop());
    try { this.dataChannel?.close(); } catch (_) { /* already closed */ }
    try { this.peerConnection?.close(); } catch (_) { /* already closed */ }
    try { this.audioElement.pause(); } catch (_) { /* already detached */ }
    this.audioElement.removeAttribute('src');
    this.audioElement.srcObject = null;
    this.audioElement.remove();
    this.readyState = RealtimeBrowserTransport.CLOSED;
    this.emitClose(code, reason);
  }

  private bindEvents(): void {
    const dataChannel = this.dataChannel;
    const peerConnection = this.peerConnection;
    if (!dataChannel || !peerConnection) return;
    dataChannel.addEventListener('open', () => {
      if (this.readyState !== RealtimeBrowserTransport.CONNECTING) return;
      this.readyState = RealtimeBrowserTransport.OPEN;
      this.onopen?.(eventOf('open'));
    });
    dataChannel.addEventListener('message', (event) => {
      if (typeof event.data === 'string') this.onmessage?.(messageEventOf(event.data));
    });
    dataChannel.addEventListener('error', () => this.onerror?.(eventOf('error')));
    dataChannel.addEventListener('close', () => {
      if (this.readyState !== RealtimeBrowserTransport.CLOSED) this.close(1000, 'data channel closed');
    });

    peerConnection.addEventListener('track', (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      this.audioElement.srcObject = stream;
      this.onOutputEvent?.({ type: 'track', stream });
      void this.audioElement.play().then(() => this.removeAudioRetry()).catch(() => {
        // The pointer listener installed in the constructor is the recovery
        // path. A blocked autoplay attempt is not a transport failure.
      });
    });
    peerConnection.addEventListener('connectionstatechange', () => {
      if (peerConnection.connectionState === 'failed') this.fail(new Error('Realtime WebRTC connection failed'));
      if (peerConnection.connectionState === 'closed' && this.readyState !== RealtimeBrowserTransport.CLOSED) {
        this.close(1000, 'peer connection closed');
      }
    });
    this.audioElement.addEventListener('playing', () => this.onOutputEvent?.({ type: 'playing' }));
    this.audioElement.addEventListener('pause', () => this.onOutputEvent?.({ type: 'paused' }));
    this.audioElement.addEventListener('ended', () => this.onOutputEvent?.({ type: 'ended' }));
  }

  private startStats(): void {
    if (!this.options.onInputAmplitude && !this.options.onOutputAmplitude) return;
    this.statsTimer = setInterval(() => {
      const pc = this.peerConnection;
      if (!pc || pc.connectionState === 'closed') return;
      void pc.getStats().then((reports) => {
        reports.forEach((report) => {
          if (report.type === 'media-source' && report.kind === 'audio' && typeof report.audioLevel === 'number') {
            this.options.onInputAmplitude?.(report.audioLevel);
          }
          if (report.type === 'inbound-rtp' && report.kind === 'audio' && typeof report.audioLevel === 'number') {
            this.options.onOutputAmplitude?.(report.audioLevel);
          }
        });
      }).catch(() => {
        // Safari may omit audio-level stats; transport audio remains unaffected.
      });
    }, 100);
  }

  private removeAudioRetry(): void {
    if (!this.audioRetryHandler) return;
    document.removeEventListener('pointerup', this.audioRetryHandler);
    this.audioRetryHandler = null;
  }

  private fail(error: unknown): void {
    console.error('Realtime WebRTC transport error:', error);
    this.onerror?.(eventOf('error'));
    this.close(1011, error instanceof Error ? error.message : 'WebRTC transport failed');
  }

  private emitClose(code: number, reason: string): void {
    if (this.closeEmitted) return;
    this.closeEmitted = true;
    this.onclose?.(closeEventOf(code, reason));
  }
}

export const connectRealtimeBrowserTransport = (
  ephemeralKey: string,
  options: RealtimeBrowserTransportOptions = {},
  signal?: AbortSignal,
): Promise<RealtimeBrowserTransport> => new RealtimeBrowserTransport(options).connect(ephemeralKey, signal);
