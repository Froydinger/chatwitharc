/** Check microphone PCM after speaker ducking, independent of animation frames.
 * Server VAD supplies the speech decision. This only checks that sound persists
 * once speaker echo has had time to decay. No extra model requests are made.
 */
export const BARGE_IN_PROBE_MS = 500;
const ECHO_SETTLE_MS = 120;
const FRAME_MS = 10;
// 40ms at RMS 0.003 was barely above digital silence: a breath, a cough or a
// chair creak cleared it, so Arc got cut off by noise. Real speech sustains
// well past 150ms at a much higher level, so this keeps barge-in working while
// ignoring the things that were falsely triggering it.
const MIN_VOICED_MS = 160;
const MIN_RMS = 0.018;

export class BargeInProbe {
  private voicedMs = 0;
  constructor(readonly responseId: string | null, private startedAt: number) {}

  addAudio(audio: Int16Array, now: number, sampleRate = 24000) {
    const chunkStart = now - audio.length / sampleRate * 1000;
    const skip = Math.max(0, Math.ceil((this.startedAt + ECHO_SETTLE_MS - chunkStart) * sampleRate / 1000));
    const frameSize = Math.round(sampleRate * FRAME_MS / 1000);
    for (let start = skip; start + frameSize <= audio.length; start += frameSize) {
      let sum = 0;
      for (let i = start; i < start + frameSize; i++) sum += (audio[i] / 32768) ** 2;
      if (Math.sqrt(sum / frameSize) >= MIN_RMS) this.voicedMs += FRAME_MS;
    }
  }

  get confirmed() { return this.voicedMs >= MIN_VOICED_MS; }
}
