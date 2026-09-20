// A WebRTC media element keeps playing across silence. Its `playing` event
// describes the transport, not whether Arc is currently speaking. This helper
// affects only the indicator; it never gates the microphone or audio playback.
export class LiveSpeechIndicator {
  private lastAudibleAt = -Infinity;

  sample(level: number, now: number): boolean {
    if (Number.isFinite(level) && level > 0.005) this.lastAudibleAt = now;
    return now - this.lastAudibleAt < 600;
  }
}
