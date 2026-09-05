/** Check microphone PCM after speaker ducking, independent of animation frames.
 * Server VAD supplies the speech decision. This only checks that sound persists
 * once speaker echo has had time to decay. No extra model requests are made.
 */
export const BARGE_IN_PROBE_MS = 450;
const ECHO_SETTLE_MS = 100;
const FRAME_MS = 10;
// Require a sustained voice-like signal after speaker echo has settled. The
// old 40 ms / 0.003 gate was close enough to digital silence that breathing
// and handling noise on an iPhone could interrupt playback.
const MIN_VOICED_MS = 160;
const MIN_RMS = 0.008;

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
      // A cough or a few spaced key clicks must not accumulate into a voice
      // interruption. Only consecutive voice-level frames count.
      if (Math.sqrt(sum / frameSize) >= MIN_RMS) {
        this.voicedMs += FRAME_MS;
      } else {
        this.voicedMs = 0;
      }
    }
  }

  get confirmed() { return this.voicedMs >= MIN_VOICED_MS; }
}
