// Local feedback only: never routed through the voice model or microphone.
let audio: HTMLAudioElement | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let pendingTools = false;
let state = { active: false, busy: false, speaking: false, volume: 1 };
let ready = false;
let playing = false;
let failed = false;
let generation = 0;

const getAudio = () => {
  if (!audio && typeof Audio !== 'undefined') {
    audio = new Audio('/sounds/voice-tool-working.mp3');
    audio.loop = true;
    audio.preload = 'auto';
  }
  return audio;
};

function sync() {
  const wanted = state.active && (state.busy || pendingTools);
  if (!wanted) {
    generation++;
    if (timer) clearTimeout(timer);
    timer = null;
    ready = false;
    playing = false;
    failed = false;
    if (audio) { audio.pause(); audio.currentTime = 0; }
    return;
  }
  if (!ready && !timer) {
    timer = setTimeout(() => { timer = null; ready = true; sync(); }, 1500);
  }
  const element = getAudio();
  if (!element) return;
  element.volume = Math.max(0, Math.min(1, state.volume)) * 0.2;
  // Leave room for Arc's spoken acknowledgment/result; resume if work continues.
  element.muted = state.speaking || state.volume === 0;
  if (ready && !playing && !failed) {
    const run = ++generation;
    playing = true;
    void element.play().then(() => {
      if (run !== generation && !playing) element.pause();
    }).catch(() => { if (run === generation) { playing = false; failed = true; } });
  }
}

// Called from the existing voice-start gesture to unlock this media element.
export function prepareVoiceToolCue() {
  failed = false;
  const element = getAudio();
  if (!element || playing) return;
  const run = ++generation;
  element.muted = true;
  void element.play().then(() => {
    if (run !== generation) return;
    element.pause(); element.currentTime = 0;
    sync();
  }).catch(() => {});
}

export function setVoiceToolPending(pending: boolean) { pendingTools = pending; sync(); }
export function updateVoiceToolCue(next: typeof state) { state = next; sync(); }
