import { expect } from 'vitest';
import { applyAction, createGame, legalMoves, type CardType, type GameAction, type GameConfig, type GameState, type GemKind } from '@/engine';

export const T0 = 1_000_000;

/**
 * A deterministic match: players a, b (, c, d); `a` goes first; no clocks unless asked.
 * Two players sit Red (a, entry c0) and Purple (b, entry c20). Four players: a Red, b Blue (c10),
 * c Purple (c20), d Green (c30).
 */
export function game(players = 2, config: Partial<GameConfig> = {}): GameState {
  const ids = ['a', 'b', 'c', 'd'].slice(0, players);
  return createGame({
    players: ids.map((id) => ({ id, name: id.toUpperCase() })),
    seed: 42,
    now: T0,
    firstPlayer: 0,
    config: { matchDurationMs: 0, turnDurationMs: 0, ...config },
  });
}

/**
 * Put a character on a space. `lap: n` also marks n plates touched: the rival plates first, the
 * owner's own plate last (so `lap: 3` still needs only its home plate).
 */
export function place(s: GameState, characterId: string, node: string, extra: Partial<GameState['characters'][string]> = {}) {
  const ch = s.characters[characterId];
  if (extra.lap !== undefined && !extra.plates) {
    const own = s.players.find((p) => p.id === ch.owner)!.seat;
    extra = { ...extra, plates: [...[0, 1, 2, 3].filter((x) => x !== own), own].slice(0, extra.lap) };
  }
  Object.assign(ch, { node, ...extra });
  if (extra.plates) ch.lap = ch.plates.length;
  return s;
}

/** Give a character a gem to carry. Returns the gem id. */
export function carry(s: GameState, characterId: string, kind: GemKind) {
  const id = `g-${characterId}-${kind}`;
  s.gems.push({ id, kind, node: null, carriedBy: characterId });
  s.characters[characterId].carrying.push(id);
  return id;
}

/** Leave a gem lying on a space. */
export function dropAt(s: GameState, node: string, kind: GemKind) {
  const id = `g-${node}-${kind}`;
  s.gems.push({ id, kind, node, carriedBy: null });
  return id;
}

export const player = (s: GameState, id: string) => s.players.find((p) => p.id === id)!;

/** Bank gems and mark a cut so the player's Royal Path is open. */
export function unlock(s: GameState, playerId: string) {
  player(s, playerId).gems = ['ruby', 'sapphire', 'emerald', 'diamond'];
  s.stats[playerId].cuts = 1;
  return s;
}

export function hand(s: GameState, playerId: string, types: CardType[]) {
  s.hands[playerId] = types.map((type, i) => ({ id: `t-${playerId}-${i}-${type}`, type }));
  return s.hands[playerId];
}

export function act(s: GameState, playerId: string, action: GameAction, now = T0): GameState {
  const r = applyAction(s, { playerId, action }, now);
  if (!r.ok) throw new Error(`Rejected ${JSON.stringify(action)}: ${r.error}`);
  return r.state;
}

export function reject(s: GameState, playerId: string, action: GameAction, match?: RegExp) {
  const r = applyAction(s, { playerId, action }, T0);
  expect(r.ok).toBe(false);
  if (!r.ok && match) expect(r.error).toMatch(match);
}

/** Roll the turn's die with a forced value. */
export function rollWith(s: GameState, playerId: string, value: number) {
  s.forcedRolls = [value];
  return act(s, playerId, { type: 'roll' });
}

/** Commit a full route for one character. */
export function move(s: GameState, playerId: string, characterId: string, path: string[]) {
  return act(s, playerId, { type: 'move', characterId, path });
}

/** Destinations a character could end on after the roll. */
export function endsFor(s: GameState, characterId: string) {
  return new Set(legalMoves(s, characterId).map((m) => m.path[m.path.length - 1]));
}

/** Route that a character would take to reach `end` (first legal match). */
export function routeTo(s: GameState, characterId: string, end: string) {
  const m = legalMoves(s, characterId).find((o) => o.path[o.path.length - 1] === end);
  if (!m) throw new Error(`${characterId} cannot reach ${end}; ends: ${[...endsFor(s, characterId)].join(', ')}`);
  return m.path;
}

/** Roll and move straight to `end`. */
export function rollMove(s: GameState, playerId: string, characterId: string, value: number, end: string) {
  s = rollWith(s, playerId, value);
  return move(s, playerId, characterId, routeTo(s, characterId, end));
}

/** Reset the turn so it is `playerId`'s fresh turn. */
export function freshTurn(s: GameState, playerId: string) {
  s.turn = { ...s.turn, playerId, moveDone: false, adventureDone: false, move: null, acted: false, witchPortalUsed: false, extra: null, bonus: false };
  return s;
}

/** Empty every hand so the adventure step auto-skips when nothing else applies. */
export function noCards(s: GameState) {
  for (const id of Object.keys(s.hands)) s.hands[id] = [];
  return s;
}
