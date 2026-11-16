/**
 * QA helpers for Island Adventure acceptance. Prefer black-box applyAction + public queries.
 * Reuses shared fixtures from tests/helpers without editing them.
 */
import { expect } from 'vitest';
import {
  applyAction,
  legalMoves,
  stepsFor,
  toPlayerView,
  type GameAction,
  type GameState,
  type GemKind,
  type MoveOption,
} from '@/engine';
import {
  act,
  carry,
  endsFor,
  freshTurn,
  game,
  hand,
  move,
  noCards,
  place,
  player,
  reject,
  rollMove,
  rollWith,
  routeTo,
  T0,
  unlock,
} from '../helpers';

export {
  act,
  carry,
  endsFor,
  freshTurn,
  game,
  hand,
  move,
  noCards,
  place,
  player,
  reject,
  rollMove,
  rollWith,
  routeTo,
  T0,
  unlock,
};

/** Contract MoveOption fields that may still be missing while agents land code. */
export type QaMoveOption = MoveOption & {
  routeTargets?: string[];
  arrival?: { kind: string; need: number; success: string; failure: string } | null;
  finishes?: boolean;
};

export const qaMoves = (s: GameState, characterId: string): QaMoveOption[] => legalMoves(s, characterId) as QaMoveOption[];

export function routeTargetsOf(opt: QaMoveOption): string[] {
  return opt.routeTargets ?? [];
}

/** Bank N copies of each kind (sets both `bank` and distinct `gems`). */
export function setBank(s: GameState, playerId: string, counts: Partial<Record<GemKind, number>>) {
  const p = player(s, playerId);
  p.bank = { ...p.bank, ...counts };
  p.gems = (['ruby', 'sapphire', 'emerald', 'diamond'] as GemKind[]).filter((k) => (p.bank[k] ?? 0) >= 1);
  return s;
}

/** Four different banked gems, no capture credit — Royal Path should open on gems alone. */
export function bankFour(s: GameState, playerId: string) {
  return setBank(s, playerId, { ruby: 1, sapphire: 1, emerald: 1, diamond: 1 });
}

/** Fresh turn with Island Adventure turn fields reset. */
export function qaFresh(s: GameState, playerId: string) {
  s.turn = {
    ...s.turn,
    playerId,
    moveDone: false,
    adventureDone: false,
    move: null,
    acted: false,
    witchPortalUsed: false,
    extra: null,
    bonus: false,
    rolls: 0,
    moved: [],
    diplomacyUsed: false,
  };
  return s;
}

export function apply(s: GameState, playerId: string, action: GameAction, now = T0) {
  return applyAction(s, { playerId, action, version: s.version }, now);
}

export function must(s: GameState, playerId: string, action: GameAction, now = T0): GameState {
  const r = apply(s, playerId, action, now);
  if (!r.ok) throw new Error(`Rejected ${JSON.stringify(action)}: ${r.error}`);
  return r.state;
}

export function expectReject(s: GameState, playerId: string, action: GameAction, match?: RegExp) {
  const r = apply(s, playerId, action);
  expect(r.ok).toBe(false);
  if (!r.ok && match) expect(r.error).toMatch(match);
  return r;
}

export function viewOf(s: GameState, viewerId: string | null) {
  return toPlayerView(s, viewerId);
}

export function allowance(s: GameState, characterId: string, value: number) {
  return stepsFor(s, characterId, value).steps;
}

export function wildDragon(s: GameState, node: string) {
  s.dragon = { state: 'wild', node, companion: null, recoverUntilTurn: 0, releasedBy: null };
  return s;
}

export function companionDragon(s: GameState, characterId: string) {
  s.dragon = {
    state: 'companion',
    node: s.characters[characterId].node,
    companion: characterId,
    recoverUntilTurn: 0,
    releasedBy: null,
  };
  return s;
}

/** Park every rival piece in castles so they do not block routes. */
export function clearRivals(s: GameState, exceptOwner = 'a') {
  for (const ch of Object.values(s.characters)) {
    if (ch.owner === exceptOwner) continue;
    const seat = player(s, ch.owner).seat;
    const homes = ['home-red', 'home-blue', 'home-purple', 'home-green'];
    ch.node = homes[seat] ?? ch.node;
  }
  return s;
}
