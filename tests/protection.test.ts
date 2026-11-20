import { describe, expect, it } from 'vitest';
import { applyAction, dragonFireBlock, legalMoves, protectionLabel, toPlayerView, wardLeft, type GameState } from '@/engine';
import { monsterTargets } from '@/engine/dungeon';
import { whyNot, startPlan } from '@/lib/movePlan';
import { act, endsFor, freshTurn, game, hand, noCards, place, reject, rollMove, rollWith, T0 } from './helpers';

/** Give a ward the way the card does (full count) without spending a turn. */
function ward(s: GameState, id: string, kind: 'shield' | 'immune' | 'guarded' = 'shield', left = 2) {
  const c = s.characters[id];
  c[kind] = true;
  c.wards = { ...(c.wards ?? {}), [kind]: left };
  return s;
}

/** `a` makes one plain movement far from everything (counts as one opposing movement for b's wards). */
function quietMove(s: GameState, steps = 1) {
  s = rollWith(s, 'a', steps);
  const opt = legalMoves(s, 'a-queen').find((o) => !o.landingCuts.length);
  if (!opt) throw new Error('no quiet move');
  return act(s, 'a', { type: 'move', characterId: 'a-queen', path: opt.path });
}

describe('captures of King and Knight', () => {
  it('an unprotected King and Knight are captured by landing (King, Witch and Knight attackers)', () => {
    for (const attacker of ['a-king', 'a-witch', 'a-knight']) {
      for (const victim of ['b-king', 'b-knight']) {
        let s = noCards(game());
        place(s, attacker, 'c1');
        place(s, victim, 'c4');
        s = rollMove(s, 'a', attacker, 3, 'c4');
        expect(s.characters[victim].node, `${attacker} on ${victim}`).toBe('home-purple');
      }
    }
  });

  it('the Queen stays a diplomat: she cannot end on a rival', () => {
    const s = noCards(game());
    place(s, 'a-queen', 'c1');
    place(s, 'b-king', 'c4');
    rollWith(s, 'a', 3);
    expect(endsFor(s, 'a-queen').has('c4')).toBe(false);
  });
});

describe('temporary protection: two opposing movements', () => {
  it('blocks a capture on the second opposing movement, then expires right after it', () => {
    let s = noCards(game());
    place(s, 'a-king', 'c1');
    place(s, 'a-queen', 'c30');
    place(s, 'b-king', 'c4');
    ward(s, 'b-king');
    expect(protectionLabel(s, s.characters['b-king'])).toBe('Protection · 2 enemy moves');

    // Movement 1 (a's queen, elsewhere).
    s = quietMove(s);
    expect(wardLeft(s, s.characters['b-king'], 'shield')).toBe(1);
    expect(protectionLabel(s, s.characters['b-king'])).toBe('Protection · 1 enemy move');

    // Movement 2: the capture is still refused during it, with the reason and remaining duration.
    freshTurn(s, 'a');
    s = rollWith(s, 'a', 3);
    expect(endsFor(s, 'a-king').has('c4')).toBe(false);
    const plan = startPlan(toPlayerView(s, 'a'), 'a-king')!;
    expect(whyNot(toPlayerView(s, 'a'), plan, 'c4')).toMatch(/Shield \(Protection · 1 enemy move left\)/);
    reject(s, 'a', { type: 'move', characterId: 'a-king', path: ['c1', 'c2', 'c3', 'c4'] }, /not legal/);
    // A rejected request does not count; the actual second movement does, and expiry follows at once.
    const opt = legalMoves(s, 'a-king').find((o) => o.path.at(-1) !== 'c4')!;
    s = act(s, 'a', { type: 'move', characterId: 'a-king', path: opt.path });
    expect(s.characters['b-king'].shield).toBe(false);
    expect(s.lastEvents).toContainEqual({ type: 'protectionEnded', characterId: 'b-king', ward: 'shield', reason: 'expired' });

    // Now the King is capturable again.
    freshTurn(s, 'a');
    place(s, 'a-king', 'c1');
    s = rollMove(s, 'a', 'a-king', 3, 'c4');
    expect(s.characters['b-king'].node).toBe('home-purple');
  });

  it('a bonus-roll movement counts as another movement', () => {
    let s = noCards(game());
    place(s, 'a-queen', 'c30');
    place(s, 'b-knight', 'c4');
    ward(s, 'b-knight', 'immune');
    s = rollWith(s, 'a', 6);
    const opt = legalMoves(s, 'a-queen')[0];
    s = act(s, 'a', { type: 'move', characterId: 'a-queen', path: opt.path });
    expect(s.turn.playerId).toBe('a'); // bonus roll pending
    expect(wardLeft(s, s.characters['b-knight'], 'immune')).toBe(1);
    s = quietMove(s);
    expect(s.characters['b-knight'].immune).toBe(false);
  });

  it('dice, adventure actions and the owner’s own moves do not count', () => {
    let s = noCards(game());
    place(s, 'b-king', 'c4');
    place(s, 'a-queen', 'c30');
    ward(s, 'b-king', 'guarded');
    s = rollWith(s, 'a', 2);
    expect(wardLeft(s, s.characters['b-king'], 'guarded')).toBe(2);
    s = act(s, 'a', { type: 'skipAdventure' });
    expect(wardLeft(s, s.characters['b-king'], 'guarded')).toBe(2);
    // b's own movement leaves b's ward alone.
    freshTurn(s, 'b');
    place(s, 'b-queen', 'c22');
    s = rollWith(s, 'b', 1);
    const opt = legalMoves(s, 'b-queen')[0];
    s = act(s, 'b', { type: 'move', characterId: 'b-queen', path: opt.path });
    expect(wardLeft(s, s.characters['b-king'], 'guarded')).toBe(2);
  });

  it('reapplying refreshes to two and never stacks', () => {
    let s = noCards(game());
    place(s, 'a-king', 'c4');
    ward(s, 'a-king', 'shield', 1);
    hand(s, 'a', ['shield']);
    s = act(s, 'a', { type: 'playCard', cardId: s.hands.a[0].id, target: { kind: 'character', characterId: 'a-king' } });
    expect(s.characters['a-king'].wards?.shield).toBe(2);
    expect(s.lastEvents).toContainEqual(expect.objectContaining({ type: 'protectionGranted', characterId: 'a-king', refreshed: true, moves: 2 }));
  });

  it('a Shield used up by a monster attack is removed at once', () => {
    let s = noCards(game());
    for (const m of s.monsters!) m.restUntilRound = m.id === 'golem' ? 0 : 99;
    place(s, 'b-king', 'd-c2');
    ward(s, 'b-king', 'shield');
    expect(monsterTargets(s, 'golem').map((c) => c.id)).toEqual(['b-king']);
    s.forcedRolls = [4, 1];
    s = act(s, 'a', { type: 'skipMove' });
    if (s.turn.playerId === 'a') s = act(s, 'a', { type: 'skipAdventure' });
    s = act(s, 'b', { type: 'skipMove' });
    if (s.turn.playerId === 'b') s = act(s, 'b', { type: 'skipAdventure' });
    const ev = s.lastEvents.find((e) => e.type === 'monsterEvent');
    expect(ev).toMatchObject({ kind: 'attack', characterId: 'b-king', outcome: 'blocked' });
    expect(s.characters['b-king']).toMatchObject({ node: 'd-c2', shield: false });
    expect(s.lastEvents).toContainEqual({ type: 'protectionEnded', characterId: 'b-king', ward: 'shield', reason: 'consumed' });
  });

  it('survives save/resume and is part of every player view', () => {
    const s = noCards(game());
    ward(s, 'b-king', 'shield', 1);
    const resumed = JSON.parse(JSON.stringify(s)) as GameState;
    expect(wardLeft(resumed, resumed.characters['b-king'], 'shield')).toBe(1);
    expect(toPlayerView(resumed, 'a').characters['b-king'].wards).toEqual({ shield: 1 });
  });

  it('older saves with a bare shield flag read as a full two-move ward', () => {
    const s = noCards(game());
    s.characters['b-king'].shield = true;
    expect(wardLeft(s, s.characters['b-king'], 'shield')).toBe(2);
  });

  it('protection no longer ends when its owner’s turn starts', () => {
    let s = noCards(game());
    freshTurn(s, 'b');
    ward(s, 'b-king', 'shield');
    s = act(s, 'b', { type: 'skipMove' });
    if (s.turn.playerId === 'b') s = act(s, 'b', { type: 'skipAdventure' });
    s = act(s, 'a', { type: 'skipMove' });
    if (s.turn.playerId === 'a') s = act(s, 'a', { type: 'skipAdventure' });
    expect(s.turn.playerId).toBe('b');
    expect(s.characters['b-king'].shield).toBe(true);
  });
});

describe('Dragon Fire defenses', () => {
  it('explains every blocked target, keeping the Witch trait separate from timed wards', () => {
    const s = noCards(game());
    place(s, 'a-king', 'c1');
    s.dragon = { state: 'companion', node: 'c1', companion: 'a-king', recoverUntilTurn: 0, releasedBy: null };
    place(s, 'b-witch', 'c2');
    place(s, 'b-king', 'c3');
    ward(s, 'b-king', 'shield', 1);
    place(s, 'b-knight', 'c9');
    place(s, 'b-queen', 'c4');
    expect(dragonFireBlock(s, 'a', 'b-witch')).toMatch(/permanently immune/);
    expect(dragonFireBlock(s, 'a', 'b-king')).toMatch(/Shield \(Protection · 1 enemy move left\)/);
    expect(dragonFireBlock(s, 'a', 'b-knight')).toMatch(/Out of range: about [\d.]+ spaces away/);
    expect(dragonFireBlock(s, 'a', 'b-queen')).toBeNull();
  });

  it('cannot execute twice in one turn (the second request is refused)', () => {
    const s = noCards(game());
    place(s, 'a-king', 'c1');
    s.dragon = { state: 'companion', node: 'c1', companion: 'a-king', recoverUntilTurn: 0, releasedBy: null };
    place(s, 'b-queen', 'c4');
    s.forcedRolls = [2];
    const first = applyAction(s, { playerId: 'a', action: { type: 'dragonFire', targetId: 'b-queen' }, version: s.version }, T0);
    expect(first.ok).toBe(true);
    // A repeated tap carries the same (now stale) version and is refused.
    const again = applyAction(first.ok ? first.state : s, { playerId: 'a', action: { type: 'dragonFire', targetId: 'b-queen' }, version: s.version }, T0);
    expect(again.ok).toBe(false);
  });
});
