import type { BoardState, Character, GameEvent } from './types';

/**
 * Temporary capture protection (Shield card, Immunity card, the King's Royal Guard).
 *
 * Each ward lasts a number of *opposing movement actions*, counted across every rival kingdom
 * (`config.protectionMoves`, default 2). A rival's bonus-roll move counts as another movement. Dice,
 * failed requests, Adventure actions, cards (Magic Boots included) and reconnects never count. A
 * ward still protects during the movement that uses up its last count, and expires right after it.
 * Granting a ward again refreshes it to the full count; wards never stack.
 *
 * Permanent character traits (the Witch is immune to Dragon Fire) are not wards: they never expire
 * and live in `PERMANENT_TRAITS`.
 */
export type WardKind = 'shield' | 'immune' | 'guarded';
export const WARD_KINDS: WardKind[] = ['shield', 'immune', 'guarded'];
export const WARD_NAMES: Record<WardKind, string> = { shield: 'Shield', immune: 'Immunity', guarded: 'Royal Guard' };

/** Traits that never expire, kept apart from temporary wards. */
export const PERMANENT_TRAITS = {
  witchFireImmune: 'The Witch is permanently immune to Dragon Fire (a character trait, not a timed power).',
} as const;

export const protectionMoves = (s: Pick<BoardState, 'config'>) => s.config.protectionMoves ?? 2;

/** Opposing movements left on one ward (0 = not active). Older saves without counts read as full. */
export function wardLeft(s: Pick<BoardState, 'config'>, c: Character, kind: WardKind): number {
  if (!c[kind]) return 0;
  return Math.max(1, c.wards?.[kind] ?? protectionMoves(s));
}

/** The longest-lasting active ward on a piece, or null. */
export function activeWard(s: Pick<BoardState, 'config'>, c: Character): { kind: WardKind; left: number } | null {
  let best: { kind: WardKind; left: number } | null = null;
  for (const kind of WARD_KINDS) {
    const left = wardLeft(s, c, kind);
    if (left && (!best || left > best.left)) best = { kind, left };
  }
  return best;
}

export const movesLabel = (n: number) => `${n} enemy ${n === 1 ? 'move' : 'moves'}`;

/** "Protection · 2 enemy moves" (null when unprotected). */
export function protectionLabel(s: Pick<BoardState, 'config'>, c: Character): string | null {
  const w = activeWard(s, c);
  return w ? `Protection · ${movesLabel(w.left)}` : null;
}

/** Turn a ward on, or refresh it to the full count (never stacks). */
export function grantWard(s: Pick<BoardState, 'config'>, c: Character, kind: WardKind): void {
  c[kind] = true;
  c.wards = { ...(c.wards ?? {}), [kind]: protectionMoves(s) };
}

/** Turn a ward off (no event). */
export function dropWard(c: Character, kind: WardKind): void {
  c[kind] = false;
  if (c.wards) {
    const rest = { ...c.wards };
    delete rest[kind];
    c.wards = Object.keys(rest).length ? rest : undefined;
  }
}

/** Every ward off (captured, burned, sent home). */
export function dropAllWards(c: Character): void {
  for (const k of WARD_KINDS) dropWard(c, k);
}

/**
 * One opposing movement action by `moverOwner` has resolved: every rival ward ticks down, and those
 * reaching 0 expire now. Returns the expiration events (the caller logs them).
 */
export function tickWards(s: Pick<BoardState, 'config' | 'characters'>, moverOwner: string): GameEvent[] {
  const out: GameEvent[] = [];
  for (const c of Object.values(s.characters)) {
    if (c.owner === moverOwner) continue;
    for (const kind of WARD_KINDS) {
      const left = wardLeft(s, c, kind);
      if (!left) continue;
      if (left <= 1) {
        dropWard(c, kind);
        out.push({ type: 'protectionEnded', characterId: c.id, ward: kind, reason: 'expired' });
      } else c.wards = { ...(c.wards ?? {}), [kind]: left - 1 };
    }
  }
  return out;
}

/** "a Shield (Protection · 1 enemy move left)", for blocked-capture explanations. Null when unprotected. */
export function wardReason(s: Pick<BoardState, 'config'>, c: Character): string | null {
  const w = activeWard(s, c);
  if (!w) return null;
  const what = w.kind === 'shield' ? 'a Shield' : w.kind === 'immune' ? 'Immunity' : 'the Royal Guard';
  return `${what} (Protection · ${movesLabel(w.left)} left)`;
}
