let audioContext: AudioContext | null = null;
let sourceAudio: HTMLAudioElement | null = null;
let sourceNode: MediaElementAudioSourceNode | null = null;
let gainNode: GainNode | null = null;

function isIOSDevice() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

function syncConnectedOutput(audio: HTMLAudioElement, volume: number) {
  if (sourceAudio !== audio || !gainNode || !audioContext) return false;
  audio.volume = 1;
  gainNode.gain.setTargetAtTime(volume, audioContext.currentTime, 0.01);
  return true;
}

/**
 * iOS Safari does not reliably apply HTMLMediaElement.volume. Once the user
 * touches the music controls, route the element through a gain node so the
 * slider controls the actual output without changing the voice audio path.
 */
export function setMusicOutputVolume(audio: HTMLAudioElement, volume: number) {
  const safeVolume = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 0));
  if (!isIOSDevice()) {
    audio.volume = safeVolume;
    return;
  }

  if (syncConnectedOutput(audio, safeVolume)) {
    if (audioContext?.state === "suspended") void audioContext.resume();
    return;
  }

  try {
    const AudioContextConstructor = window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) throw new Error("Web Audio is unavailable");

    audioContext = audioContext || new AudioContextConstructor();
    sourceNode = audioContext.createMediaElementSource(audio);
    gainNode = audioContext.createGain();
    sourceNode.connect(gainNode);
    gainNode.connect(audioContext.destination);
    sourceAudio = audio;
    audio.volume = 1;
    gainNode.gain.value = safeVolume;
    if (audioContext.state === "suspended") void audioContext.resume();
  } catch {
    // Keep the native path as a fallback for older WebKit and non-browser tests.
    audio.volume = safeVolume;
  }
}

export function syncMusicOutputVolume(audio: HTMLAudioElement, volume: number) {
  if (!syncConnectedOutput(audio, Math.min(1, Math.max(0, volume)))) {
    audio.volume = Math.min(1, Math.max(0, volume));
  }
}

export function resumeMusicOutput(audio: HTMLAudioElement) {
  if (sourceAudio === audio && audioContext?.state === "suspended") {
    void audioContext.resume();
  }
}
