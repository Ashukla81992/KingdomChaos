/** Tiny synthesized sound effects (no audio assets). */
export type SoundName = 'roll' | 'step' | 'capture' | 'bank' | 'card' | 'turn' | 'error' | 'win' | 'pickup';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, start: number, dur: number, volume: number, type: OscillatorType = 'sine') {
  const a = audio();
  if (!a) return;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, a.currentTime + start);
  gain.gain.setValueAtTime(0.0001, a.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), a.currentTime + start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + dur);
  osc.connect(gain).connect(a.destination);
  osc.start(a.currentTime + start);
  osc.stop(a.currentTime + start + dur + 0.02);
}

const PATTERNS: Record<SoundName, [number, number, number, OscillatorType?][]> = {
  roll: [[300, 0, 0.05, 'square'], [420, 0.06, 0.05, 'square'], [360, 0.12, 0.05, 'square'], [520, 0.18, 0.08, 'square']],
  step: [[660, 0, 0.06, 'triangle']],
  capture: [[220, 0, 0.12, 'sawtooth'], [160, 0.1, 0.18, 'sawtooth']],
  bank: [[523, 0, 0.12], [659, 0.1, 0.12], [784, 0.2, 0.22]],
  pickup: [[880, 0, 0.08, 'triangle'], [1175, 0.07, 0.12, 'triangle']],
  card: [[440, 0, 0.06, 'triangle'], [660, 0.05, 0.1, 'triangle']],
  turn: [[587, 0, 0.1, 'sine'], [784, 0.08, 0.14, 'sine']],
  error: [[180, 0, 0.12, 'square']],
  win: [[523, 0, 0.15], [659, 0.15, 0.15], [784, 0.3, 0.15], [1047, 0.45, 0.4]],
};

export function playSound(name: SoundName, volume: number) {
  if (volume <= 0) return;
  for (const [f, s, d, t] of PATTERNS[name]) tone(f, s, d, volume * 0.25, t ?? 'sine');
}
