import { applyAction, createGame, type CardType, type GameAction, type GameState } from '@/engine';

export const A = 'A';
export const B = 'B';
export const ch = (pid: string, kind: string) => `${pid}-${kind}`;

/** Two-player game: A at north castle c0, B at south castle c2. A moves first. Hands are emptied. */
export function setup(opts: { players?: number; config?: Parameters<typeof createGame>[0]['config'] } = {}): GameState {
  const ids = ['A', 'B', 'C', 'D'].slice(0, opts.players ?? 2);
  const s = createGame({
    players: ids.map((id) => ({ id, name: id })),
    seed: 42,
    now: 0,
    firstPlayer: 0,
    config: opts.config,
  });
  for (const id of ids) {
    s.deck.push(...s.hands[id]);
    s.hands[id] = [];
  }
  return s;
}

export function place(s: GameState, charId: string, space: string) {
  s.characters[charId].space = space;
}

/** Put the current player straight into the move phase with a given roll. */
export function rolled(s: GameState, steps: number) {
  s.turn.phase = 'move';
  s.turn.roll = steps;
  s.turn.steps = steps;
}

export function act(s: GameState, playerId: string, action: GameAction, now = 1000): GameState {
  const r = applyAction(s, { playerId, action }, now);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

export function tryAct(s: GameState, playerId: string, action: GameAction, now = 1000) {
  return applyAction(s, { playerId, action }, now);
}

export function give(s: GameState, playerId: string, type: CardType): string {
  const id = `test-${type}-${s.cardCounter++}`;
  s.hands[playerId].push({ id, type });
  return id;
}

export function carry(s: GameState, charId: string, treasureHome = 'm1') {
  const t = s.treasures.find((x) => x.home === treasureHome)!;
  t.space = null;
  t.carriedBy = charId;
  s.characters[charId].carrying = t.id;
}

/** Make it `playerId`'s action phase (already moved). */
export function actionPhase(s: GameState, playerId: string) {
  s.turn.playerId = playerId;
  s.turn.phase = 'action';
  s.turn.cardPlayed = false;
}
