/**
 * Synthesized sound effects. Every sound is generated in the browser with the Web Audio API from
 * oscillators and filtered noise: there are no audio files, so there is nothing to license. Sources
 * are recorded in docs/SOUNDS.md.
 *
 * Browsers start audio suspended until the first user gesture. `unlockAudio` is wired to the first
 * pointer or key press; until then (or when audio is blocked or unsupported) sounds are silently
 * skipped. Essential feedback never depends on sound: every event also has text and a visual.
 */
export type SoundName =
  | 'roll'
  | 'step'
  | 'capture'
  | 'bank'
  | 'card'
  | 'turn'
  | 'error'
  | 'win'
  | 'pickup'
  | 'shieldBlock'
  | 'shieldUp'
  | 'shieldExpire'
  | 'portal'
  | 'bridge'
  | 'golemSlam'
  | 'spiderWeb'
  | 'monsterAlert'
  | 'dragonFire'
  | 'fireMiss'
  | 'strike'
  | 'guard';

let ctx: AudioContext | null = null;
let blocked = false;
let unlocked = false;

function audio(): AudioContext | null {
  if (typeof window === 'undefined' || blocked) return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) {
        blocked = true;
        return null;
      }
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    return ctx.state === 'running' || unlocked ? ctx : null;
  } catch {
    blocked = true;
    return null;
  }
}

/** Call from a user gesture: resumes the audio context so later event sounds can play. */
export function unlockAudio() {
  if (unlocked || typeof window === 'undefined') return;
  try {
    const a = audio() ?? ctx;
    if (!a) return;
    void a
      .resume()
      .then(() => {
        unlocked = a.state === 'running';
      })
      .catch(() => undefined);
  } catch {
    /* audio unavailable: stay silent */
  }
}

/** Whether the browser is currently letting us play (false before the first tap on most phones). */
export const audioReady = () => !!ctx && ctx.state === 'running';

function tone(a: AudioContext, freq: number, start: number, dur: number, volume: number, type: OscillatorType = 'sine', slideTo?: number) {
  const osc = a.createOscillator();
  const gain = a.createGain();
  const t0 = a.currentTime + start;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** A burst of filtered noise (thuds, whooshes, fire). */
function noise(a: AudioContext, start: number, dur: number, volume: number, filter: BiquadFilterType, freq: number, sweepTo?: number) {
  const len = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  const t0 = a.currentTime + start;
  f.type = filter;
  f.frequency.setValueAtTime(freq, t0);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
  const gain = a.createGain();
  gain.gain.setValueAtTime(Math.max(0.0002, volume), t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(gain).connect(a.destination);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

type Voice = (a: AudioContext, v: number) => void;

const T = (f: number, s: number, d: number, type: OscillatorType = 'sine', slide?: number): Voice => (a, v) => tone(a, f, s, d, v, type, slide);
const N = (s: number, d: number, filter: BiquadFilterType, f: number, sweep?: number, gain = 1): Voice => (a, v) => noise(a, s, d, v * gain, filter, f, sweep);

const VOICES: Record<SoundName, Voice[]> = {
  roll: [N(0, 0.05, 'bandpass', 1800), N(0.07, 0.05, 'bandpass', 2200), N(0.14, 0.05, 'bandpass', 1600), T(520, 0.2, 0.08, 'square')],
  step: [N(0, 0.05, 'lowpass', 500, undefined, 1.4), T(180, 0, 0.05, 'triangle')],
  capture: [T(220, 0, 0.12, 'sawtooth'), T(160, 0.1, 0.18, 'sawtooth'), N(0.02, 0.15, 'lowpass', 900)],
  bank: [T(523, 0, 0.12), T(659, 0.1, 0.12), T(784, 0.2, 0.22), T(1568, 0.22, 0.2, 'triangle')],
  pickup: [T(880, 0, 0.08, 'triangle'), T(1175, 0.07, 0.12, 'triangle')],
  card: [N(0, 0.06, 'highpass', 3000), T(660, 0.04, 0.08, 'triangle')],
  turn: [T(587, 0, 0.1), T(784, 0.08, 0.14)],
  error: [T(180, 0, 0.12, 'square')],
  win: [T(523, 0, 0.15), T(659, 0.15, 0.15), T(784, 0.3, 0.15), T(1047, 0.45, 0.4), T(1319, 0.45, 0.4, 'triangle')],
  shieldBlock: [T(1200, 0, 0.18, 'triangle', 900), T(1800, 0, 0.12, 'sine'), N(0, 0.08, 'highpass', 4000)],
  shieldUp: [T(440, 0, 0.12, 'sine', 880), T(880, 0.1, 0.15, 'triangle')],
  shieldExpire: [T(880, 0, 0.2, 'triangle', 330)],
  portal: [T(300, 0, 0.35, 'sine', 1200), T(450, 0.05, 0.3, 'triangle', 1500)],
  bridge: [N(0, 0.18, 'lowpass', 700, 300, 1.4), T(140, 0, 0.18, 'square', 90)],
  golemSlam: [N(0, 0.35, 'lowpass', 400, 80, 2), T(70, 0, 0.35, 'sine', 40)],
  spiderWeb: [T(1800, 0, 0.12, 'triangle', 600), N(0.05, 0.2, 'highpass', 2500, 6000)],
  monsterAlert: [T(196, 0, 0.18, 'sawtooth', 160)],
  dragonFire: [N(0, 0.12, 'lowpass', 300, 900), N(0.1, 0.45, 'bandpass', 900, 2600, 1.6), T(110, 0.1, 0.4, 'sawtooth', 70)],
  fireMiss: [N(0, 0.18, 'bandpass', 600, 300), T(220, 0.05, 0.12, 'square', 120)],
  strike: [N(0, 0.06, 'highpass', 2500), T(320, 0.02, 0.1, 'square', 180)],
  guard: [T(700, 0, 0.15, 'triangle', 500), N(0, 0.05, 'bandpass', 3000)],
};

export function playSound(name: SoundName, volume: number) {
  if (volume <= 0) return;
  const a = audio();
  if (!a) return;
  try {
    for (const voice of VOICES[name]) voice(a, volume * 0.25);
  } catch {
    /* a blocked or closed context: skip this sound */
  }
}
