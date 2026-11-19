import { describe, expect, it } from 'vitest';
import { getBoard, legalMoves, movableCharacters, stepsFor, toPlayerView, type GameState, type MonsterId } from '@/engine';
import { golemPushTarget, monsterReach, monsterTargets, resolveArrival } from '@/engine/dungeon';
import { act, game, noCards, place, rollWith } from './helpers';

/** Only `id` may act (the other monster rests for the whole test). */
function only(s: GameState, id: MonsterId) {
  for (const m of s.monsters!) m.restUntilRound = m.id === id ? 0 : 99;
  return s;
}

/** Both players pass, which ends round 1 and resolves its monster event with this die. */
function endRound(s: GameState, die: number) {
  s.forcedRolls = [die];
  s = act(s, 'a', { type: 'skipMove' });
  if (s.turn.playerId === 'a') s = act(s, 'a', { type: 'skipAdventure' });
  s = act(s, 'b', { type: 'skipMove' });
  if (s.turn.playerId === 'b') s = act(s, 'b', { type: 'skipAdventure' });
  return s;
}

const monsterEvent = (s: GameState) => s.lastEvents.find((e) => e.type === 'monsterEvent');

describe('roaming dungeon monsters', () => {
  it('start on their encounter spaces and are part of every player view', () => {
    const s = game();
    expect(s.monsters).toEqual([
      expect.objectContaining({ id: 'golem', home: 'd-golem', node: 'd-golem', restUntilRound: 0 }),
      expect.objectContaining({ id: 'spider', home: 'd-spider', node: 'd-spider', restUntilRound: 0 }),
    ]);
    expect(toPlayerView(s, 'a').monsters).toEqual(s.monsters);
  });

  it('reach 3 connected steps inside, and 3 steps of the Dragon Gate road outside', () => {
    const s = game();
    const { inside, outside } = monsterReach(s);
    expect(inside.golem.has('d-c3')).toBe(true); // golem → c2 → c3 (2)
    expect(inside.golem.has('d-entrance')).toBe(false); // 4 steps away
    expect(inside.spider.has('d-e1')).toBe(true);
    expect(outside.has('c16')).toBe(true);
    const { nodes } = getBoard(s.boardId);
    expect([...outside].every((n) => nodes[n].map === 'island')).toBe(true);
  });

  it('never target safe spaces, castles, Royal Paths, the temple, Immune or Guarded pieces', () => {
    const s = noCards(game());
    place(s, 'b-king', 'd-ruins');
    place(s, 'b-queen', 'd-c2', { immune: true });
    expect(monsterTargets(s, 'golem')).toEqual([]);
    place(s, 'b-queen', 'd-c2', { immune: false, guarded: true });
    expect(monsterTargets(s, 'golem')).toEqual([]);
    place(s, 'a-king', 'c16');
    const gateSafe = getBoard(s.boardId).nodes.c16.safe;
    expect(monsterTargets(s, 'golem', true).map((c) => c.id)).toEqual(gateSafe ? [] : ['a-king']);
  });

  it('stop at blocked roads', () => {
    const s = noCards(game());
    // A monster cannot reach across a closed edge: close the only link from the spider to the east tunnels.
    s.transforms['d-e3'] = 'mountain';
    expect(monsterReach(s).inside.spider.has('d-e2')).toBe(false);
  });

  it('resolve once per full round: 1–3 is quiet', () => {
    let s = noCards(game());
    place(s, 'b-king', 'd-c2');
    s = endRound(s, 3);
    expect(monsterEvent(s)).toMatchObject({ kind: 'quiet', die: 3, round: 1 });
    expect(s.monsterRound).toBe(1);
    expect(s.characters['b-king'].node).toBe('d-c2');
  });

  it('do not act after a single turn or before a bonus roll', () => {
    let s = noCards(game());
    place(s, 'b-king', 'd-c2');
    s.forcedRolls = [5];
    s = act(s, 'a', { type: 'skipMove' });
    if (s.turn.playerId === 'a') s = act(s, 'a', { type: 'skipAdventure' });
    expect(monsterEvent(s)).toBeUndefined();
    expect(s.forcedRolls).toEqual([5]);
  });

  it('4–5: the Stone Golem pushes a piece in reach back two legal spaces', () => {
    let s = only(noCards(game()), 'golem');
    place(s, 'b-king', 'd-c2');
    const expected = golemPushTarget(s, s.characters['b-king'], 'd-golem');
    expect(expected).not.toBe('d-c2');
    s = endRound(s, 4);
    expect(monsterEvent(s)).toMatchObject({ kind: 'attack', monster: 'golem', effect: 'push', from: 'd-c2', to: expected, characterId: 'b-king' });
    expect(s.characters['b-king'].node).toBe(expected);
    const { nodes } = getBoard(s.boardId);
    expect(nodes[expected].encounter).toBeUndefined();
  });

  it('the golem push is deterministic and moves away from the golem', () => {
    const s = noCards(game());
    place(s, 'b-king', 'd-c2');
    const a = golemPushTarget(s, s.characters['b-king'], 'd-golem');
    const b = golemPushTarget(structuredClone(s), s.characters['b-king'], 'd-golem');
    expect(a).toBe(b);
    expect(['d-w1', 'd-lair']).toContain(a);
  });

  it('4–5: the Cave Spider webs a piece; its next move is 2 shorter (minimum 1), then the web is gone', () => {
    let s = only(noCards(game()), 'spider');
    place(s, 'a-king', 'd-e2');
    s = endRound(s, 5);
    expect(monsterEvent(s)).toMatchObject({ kind: 'attack', monster: 'spider', effect: 'web', characterId: 'a-king' });
    expect(s.characters['a-king'].webbed).toBe(true);
    // Webs never stack.
    expect(stepsFor(s, 'a-king', 5)).toMatchObject({ steps: 3 });
    expect(stepsFor(s, 'a-king', 2)).toMatchObject({ steps: 1 });
    s = rollWith(s, 'a', 5);
    const mover = movableCharacters(s).find((m) => m.characterId === 'a-king')!;
    expect(mover.steps).toBe(3);
    expect(mover.note).toMatch(/Web 2/);
    s = act(s, 'a', { type: 'move', characterId: 'a-king', path: legalMoves(s, 'a-king')[0].path });
    expect(s.characters['a-king'].webbed).toBe(false);
  });

  it('web stacks with the dragon penalty: max(1, max(1, roll − 2) − 2)', () => {
    const s = noCards(game());
    place(s, 'a-king', 'c3', { webbed: true });
    s.dragon = { state: 'companion', node: 'c3', companion: 'a-king', recoverUntilTurn: 0, releasedBy: null };
    expect(stepsFor(s, 'a-king', 6).steps).toBe(2);
    expect(stepsFor(s, 'a-king', 3).steps).toBe(1);
  });

  it('6: a monster climbs out to the Dragon Gate road, attacks there, then goes back inside', () => {
    let s = only(noCards(game()), 'spider');
    const { nodes } = getBoard(s.boardId);
    const spot = [...monsterReach(s).outside].find((n) => !nodes[n].safe && nodes[n].lane !== 'home')!;
    place(s, 'b-king', spot);
    s = endRound(s, 6);
    expect(monsterEvent(s)).toMatchObject({ kind: 'attack', outside: true, at: 'c16', characterId: 'b-king', effect: 'web' });
    expect(s.monsters!.find((m) => m.id === 'spider')!.node).toBe('d-spider');
  });

  it('patrols when nobody is in reach', () => {
    let s = only(noCards(game()), 'golem');
    s = endRound(s, 4);
    expect(monsterEvent(s)).toMatchObject({ kind: 'patrol', monster: 'golem' });
  });

  it('a beaten Golem opens its shortcut for that kingdom and rests for a round (classic one-roll mode)', () => {
    const s = noCards(game(2, { golemBattle: false }));
    place(s, 'a-king', 'd-golem');
    s.forcedRolls = [5];
    resolveArrival({ state: s, events: [], now: 0 }, s.characters['a-king']);
    expect(s.characters['a-king'].node).toBe('d-e4');
    expect(s.shortcutsOpen?.['d-golem']).toEqual(['a']);
    expect(s.monsters!.find((m) => m.id === 'golem')!.restUntilRound).toBe(s.turn.round + 1);
    // Another piece of the same kingdom passes through free, no roll.
    place(s, 'a-queen', 'd-golem');
    s.forcedRolls = [];
    const ctx = { state: s, events: [] as GameState['lastEvents'], now: 0 };
    resolveArrival(ctx, s.characters['a-queen']);
    expect(s.characters['a-queen'].node).toBe('d-e4');
    expect(ctx.events.some((e) => e.type === 'encounter')).toBe(false);
    // A rival meets a resting golem: no fight, it stays.
    place(s, 'b-king', 'd-golem');
    const ctx2 = { state: s, events: [] as GameState['lastEvents'], now: 0 };
    resolveArrival(ctx2, s.characters['b-king']);
    expect(s.characters['b-king'].node).toBe('d-golem');
    expect(ctx2.events.some((e) => e.type === 'encounter')).toBe(false);
  });

  it('a resting monster recovers at the monster event of the round after it was beaten', () => {
    let s = noCards(game());
    s.monsters!.find((m) => m.id === 'spider')!.restUntilRound = 2;
    s = endRound(s, 1);
    expect(s.monsters!.find((m) => m.id === 'spider')!.restUntilRound).toBe(2);
    s = endRound(s, 1);
    expect(s.lastEvents).toContainEqual({ type: 'monsterRecovered', monster: 'spider' });
    expect(s.monsters!.find((m) => m.id === 'spider')!.restUntilRound).toBe(0);
  });

  it('matches saved before monsters existed still play and gain monsters on the first event', () => {
    let s = noCards(game());
    delete s.monsters;
    delete s.monsterRound;
    s = endRound(s, 2);
    expect(s.monsters).toHaveLength(2);
    expect(s.monsterRound).toBe(1);
  });

  it('the resolved outcome is part of the saved state (resume shows the same result)', () => {
    let s = only(noCards(game()), 'golem');
    place(s, 'b-king', 'd-c2');
    s = endRound(s, 4);
    const saved = JSON.parse(JSON.stringify(s)) as GameState;
    expect(saved.characters['b-king'].node).toBe(s.characters['b-king'].node);
    expect(saved.lastEvents).toEqual(s.lastEvents);
    expect(saved.monsterRound).toBe(1);
  });

  it('can be switched off', () => {
    let s = noCards(game(2, { monsterEvents: false }));
    place(s, 'b-king', 'd-c2');
    s = endRound(s, 4);
    expect(monsterEvent(s)).toBeUndefined();
  });
});
