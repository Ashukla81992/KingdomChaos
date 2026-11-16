import type { Ctx } from './rules';
import type { BoardState, Character, GameEvent } from './types';

/** [A3] Encounters, the dragon on the road, and the Dragon Slayer duel. Contract: docs/island-adventure/CONTRACTS.md. */

/**
 * How the dragon's space treats this mover. `block`: may end there (to tame) but never pass.
 * `pass`: may walk through and end there (the Witch). `slay`: the Queen holding Dragon Slayer may end
 * there to fight it.
 */
export function dragonSpaceRule(_s: BoardState, _characterId: string): 'block' | 'pass' | 'slay' {
  return 'block';
}

/** What ending a move on `node` would trigger, for previews. Null when nothing happens there. */
export interface ArrivalPreview {
  kind: 'golem' | 'spider' | 'slay';
  name: string;
  /** Roll needed (after the Knight's bonus). */
  need: number;
  success: string;
  failure: string;
}

export function arrivalPreview(_s: BoardState, _characterId: string, _node: string): ArrivalPreview | null {
  return null;
}

/**
 * Forced encounter at the end of a move, called by the movement code after landing captures and
 * pickups, before traps and the temple. Rolls once and moves the piece as needed.
 */
export function resolveArrival(_ctx: Ctx, _ch: Character, _discardCardId?: string | null): void {}

export type EncounterEvent = Extract<GameEvent, { type: 'encounter' | 'slay' }>;
