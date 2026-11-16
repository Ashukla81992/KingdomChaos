import { describe, expect, it } from 'vitest';
import { movableCharacters, stepsFor } from '@/engine';
import {
  allowance,
  clearRivals,
  companionDragon,
  expectReject,
  game,
  move,
  must,
  noCards,
  place,
  qaFresh,
  qaMoves,
  rollWith,
  routeTo,
  T0,
} from './helpers';

describe('M1 exact movement', () => {
  it('M1 island routes use exactly the allowance; shorter paths are rejected', () => {
    let s = noCards(clearRivals(game()));
    place(s, 'a-king', 'c8');
    s = rollWith(s, 'a', 3);
    const steps = allowance(s, 'a-king', 3);
    expect(steps).toBe(3);
    const opts = qaMoves(s, 'a-king');
    expect(opts.length).toBeGreaterThan(0);
    for (const m of opts) {
      expect(m.path.length - 1).toBe(steps);
      expect(m.cost).toBe(steps);
    }
    expectReject(s, 'a', { type: 'move', characterId: 'a-king', path: ['c8', 'c9'] });
    expectReject(s, 'a', { type: 'move', characterId: 'a-king', path: ['c8', 'c9', 'c10'] });
  });

  it('M1 dungeon routes also require the full allowance (no early stop)', () => {
    let s = noCards(clearRivals(game()));
    place(s, 'a-king', 'd-entrance');
    s = rollWith(s, 'a', 3);
    const opts = qaMoves(s, 'a-king');
    expect(opts.length).toBeGreaterThan(0);
    for (const m of opts) {
      expect(m.path.length - 1, `route ${m.path.join('>')}`).toBe(3);
    }
    // A 1-step prefix must be rejected even if the board graph would allow stopping early.
    const short = ['d-entrance', 'd-w1'];
    expectReject(s, 'a', { type: 'move', characterId: 'a-king', path: short });
  });
});

describe('M2 no legal move skips movement; bonus still resolves', () => {
  it('M2 when nothing can use the roll, emits noMove, skips move, and a pending six still grants a bonus roll', () => {
    let s = noCards(game());
    // Finished pieces never move — the only way to guarantee zero legal routes.
    for (const k of ['king', 'queen', 'witch', 'knight'] as const) {
      place(s, `a-${k}`, 'temple', { lap: 4, finished: true });
    }
    s = rollWith(s, 'a', 6);
    expect(movableCharacters(s).length).toBe(0);
    expect(s.lastEvents.some((e) => e.type === 'noMove')).toBe(true);
    expect(s.lastEvents.some((e) => e.type === 'extraTurn' && e.reason === 'six')).toBe(true);
    // Bonus from the natural 6 must still be available to the same player.
    expect(s.turn.playerId).toBe('a');
    expect(s.turn.bonus).toBe(true);
    expect(s.turn.move).toBeNull();
    s.forcedRolls = [2];
    const bonusRoll = must(s, 'a', { type: 'roll' }, T0);
    expect(bonusRoll.lastEvents.some((e) => e.type === 'rolled')).toBe(true);
  });

  it('M2 skipMove is allowed only with no legal move, and a six still yields a bonus window', () => {
    let s = noCards(game());
    for (const k of ['king', 'queen', 'witch', 'knight'] as const) {
      place(s, `a-${k}`, 'temple', { lap: 4, finished: true });
    }
    qaFresh(s, 'a');
    s.forcedRolls = [6];
    const rolled = must(s, 'a', { type: 'roll' }, T0);
    expect(movableCharacters(rolled).length).toBe(0);
    expect(rolled.lastEvents.some((e) => e.type === 'noMove')).toBe(true);
    expect(rolled.turn.playerId).toBe('a');
    expect(rolled.turn.bonus === true || rolled.turn.extra === 'six').toBe(true);
  });
});

describe('D2 dragon-adjusted steps', () => {
  it('D2 companion roll 5 yields exactly 3 steps (max(1, roll-2))', () => {
    let s = noCards(clearRivals(game()));
    place(s, 'a-king', 'c8');
    companionDragon(s, 'a-king');
    expect(stepsFor(s, 'a-king', 5).steps).toBe(3);
    s = rollWith(s, 'a', 5);
    const opts = qaMoves(s, 'a-king');
    expect(opts.length).toBeGreaterThan(0);
    for (const m of opts) expect(m.path.length - 1).toBe(3);
    expect(routeTo(s, 'a-king', 'c11')).toEqual(['c8', 'c9', 'c10', 'c11']);
    s = move(s, 'a', 'a-king', routeTo(s, 'a-king', 'c11'));
    expect(s.characters['a-king'].node).toBe('c11');
  });
});

describe('M3 forced effects log a reason', () => {
  it('M3 ending on a trap teleports with a reason line and event', () => {
    let s = noCards(clearRivals(game()));
    place(s, 'a-king', 'c31');
    s = rollWith(s, 'a', 2);
    s = move(s, 'a', 'a-king', routeTo(s, 'a-king', 'c33'));
    expect(s.characters['a-king'].node).toBe('c38');
    expect(s.lastEvents.some((e) => e.type === 'teleported' && e.reason === 'shortcut')).toBe(true);
    expect(s.log.some((l) => /Secret Passage|passage/i.test(l.text))).toBe(true);
  });
});
