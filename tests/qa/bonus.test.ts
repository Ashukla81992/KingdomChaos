import { describe, expect, it } from 'vitest';
import {
  game,
  move,
  must,
  noCards,
  place,
  rollWith,
  routeTo,
  T0,
} from './helpers';

describe('M8 bonus roll', () => {
  it('M8 a natural 6 earns exactly one bonus roll after the move', () => {
    let s = noCards(game());
    place(s, 'a-king', 'c21');
    s = rollWith(s, 'a', 6);
    expect(s.turn.extra).toBe('six');
    expect(s.lastEvents.filter((e) => e.type === 'extraTurn')).toHaveLength(1);
    s = move(s, 'a', 'a-king', routeTo(s, 'a-king', 'c27'));
    expect(s.turn.playerId).toBe('a');
    expect(s.turn.bonus).toBe(true);
    expect(s.turn.move).toBeNull();
    expect(s.turn.moveDone).toBe(false);
    expect(s.turn.extra).toBeNull();
  });

  it('M8 a movement capture earns one bonus; 6 + multi-capture is still one', () => {
    let s = noCards(game());
    place(s, 'a-king', 'c5');
    place(s, 'b-witch', 'c11');
    s = rollWith(s, 'a', 6);
    expect(s.lastEvents.filter((e) => e.type === 'extraTurn')).toHaveLength(1);
    s = move(s, 'a', 'a-king', routeTo(s, 'a-king', 'c11'));
    expect(s.lastEvents.some((e) => e.type === 'cut')).toBe(true);
    // No second extraTurn for the capture once six already earned.
    expect(s.lastEvents.filter((e) => e.type === 'extraTurn')).toHaveLength(0);
    expect(s.turn.playerId).toBe('a');
    expect(s.turn.bonus).toBe(true);
  });

  it('M8 bonus chains: a 6 on the bonus roll earns another', () => {
    let s = noCards(game());
    place(s, 'a-king', 'c8');
    s = rollWith(s, 'a', 6);
    s = move(s, 'a', 'a-king', routeTo(s, 'a-king', 'c14'));
    expect(s.turn.bonus).toBe(true);
    s = rollWith(s, 'a', 6);
    s = move(s, 'a', 'a-king', routeTo(s, 'a-king', 'c20'));
    expect(s.turn.playerId).toBe('a');
    expect(s.turn.bonus).toBe(true);
    s = rollWith(s, 'a', 1);
    s = move(s, 'a', 'a-king', routeTo(s, 'a-king', 'c21'));
    expect(s.turn.playerId).toBe('b');
  });

  it('M8 Dragon Fire never earns a bonus roll', () => {
    let s = noCards(game());
    place(s, 'a-king', 'c8');
    s.dragon = { state: 'companion', node: 'c8', companion: 'a-king', recoverUntilTurn: 0, releasedBy: null };
    place(s, 'b-king', 'c9'); // c10 is the Blue Gate (safe)
    const beforeCuts = s.stats.a.cuts;
    s = must(s, 'a', { type: 'dragonFire', targetId: 'b-king' }, T0);
    expect(s.characters['b-king'].node).toBe('home-purple');
    expect(s.stats.a.cuts).toBe(beforeCuts);
    expect(s.turn.extra).toBeNull();
    expect(s.turn.bonus).toBe(false);
    expect(s.lastEvents.some((e) => e.type === 'extraTurn')).toBe(false);
  });
});
