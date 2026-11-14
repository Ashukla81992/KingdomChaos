/** Deterministic PRNG (mulberry32). The state lives inside GameState so replays are reproducible. */
export function nextRandom(state: { rngState: number }): number {
  let t = (state.rngState = (state.rngState + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randomInt(state: { rngState: number }, maxExclusive: number): number {
  return Math.floor(nextRandom(state) * maxExclusive);
}

export function shuffle<T>(state: { rngState: number }, items: T[]): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(state, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
