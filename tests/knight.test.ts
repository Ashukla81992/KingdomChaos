import { describe, expect, it } from 'vitest';
import { legalMoves } from '@/engine';
import { act, game, noCards, place, rollMove, rollWith } from './helpers';

describe('Knight charge', () => {
  it('captures a rival it lands on', () => {
    let s = noCards(game());
    place(s, 'a-knight', 'c1');
    place(s, 'b-king', 'c4');
    s = rollWith(s, 'a', 3);
    const land = legalMoves(s, 'a-knight').find((m) => m.path[m.path.length - 1] === 'c4');
    expect(land?.routeTargets).toEqual(['b-king']);
  });

  it('passes through a single rival and captures it (the bug: it used to be blocked)', () => {
    let s = noCards(game());
    place(s, 'a-knight', 'c1');
    place(s, 'b-king', 'c2');
    s = rollWith(s, 'a', 3);
    const path = ['c1', 'c2', 'c3', 'c4'];
    const opt = legalMoves(s, 'a-knight').find((m) => m.path.join('>') === path.join('>'));
    expect(opt?.routeTargets).toEqual(['b-king']);
    s = act(s, 'a', { type: 'move', characterId: 'a-knight', path });
    expect(s.characters['b-king'].node).toBe('home-purple');
    expect(s.characters['a-knight'].node).toBe('c4');
    expect(s.stats.a.cuts).toBe(1);
  });

  it('passes through its own pieces and captures every rival on the route', () => {
    let s = noCards(game());
    place(s, 'a-knight', 'c5');
    place(s, 'a-king', 'c6');
    place(s, 'b-king', 'c7');
    place(s, 'b-queen', 'c8');
    place(s, 'b-witch', 'c9');
    s = rollWith(s, 'a', 4);
    const path = ['c5', 'c6', 'c7', 'c8', 'c9'];
    const opt = legalMoves(s, 'a-knight').find((m) => m.path.join('>') === path.join('>'));
    expect(opt?.routeTargets.sort()).toEqual(['b-king', 'b-queen', 'b-witch']);
    s = act(s, 'a', { type: 'move', characterId: 'a-knight', path });
    for (const id of ['b-king', 'b-queen', 'b-witch']) expect(s.characters[id].node).toBe('home-purple');
    expect(s.characters['a-king'].node).toBe('c6');
    expect(s.stats.a.cuts).toBe(3);
    // One bonus roll for the whole charge.
    if (!s.turn.bonus) s = act(s, 'a', { type: 'skipAdventure' });
    expect(s.turn).toMatchObject({ playerId: 'a', bonus: true });
  });

  it('a 6 plus a multi-capture still earns only one bonus roll', () => {
    let s = noCards(game());
    place(s, 'a-knight', 'c4');
    place(s, 'b-king', 'c6');
    place(s, 'b-queen', 'c7');
    s = rollWith(s, 'a', 6);
    expect(s.lastEvents.filter((e) => e.type === 'extraTurn')).toHaveLength(1);
    const path = ['c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c11'];
    // c10 is safe blue gate — skip by going c9 -> side? Keep on coast: c4..c9 is only 5 steps from c4.
    // 6 steps: c3 -> c9
    s = noCards(game());
    place(s, 'a-knight', 'c3');
    place(s, 'b-king', 'c5');
    place(s, 'b-queen', 'c6');
    s = rollWith(s, 'a', 6);
    const coast = ['c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9'];
    const option = legalMoves(s, 'a-knight').find((m) => m.path.join('>') === coast.join('>'));
    expect(option?.routeTargets.sort()).toEqual(['b-king', 'b-queen'].sort());
    s = act(s, 'a', { type: 'move', characterId: 'a-knight', path: coast });
    expect(s.lastEvents.filter((e) => e.type === 'extraTurn')).toHaveLength(0);
    expect(s.turn).toMatchObject({ playerId: 'a', bonus: true, extra: null });
  });

  it('normal Knight move still captures by landing', () => {
    let s = noCards(game());
    place(s, 'a-knight', 'c1');
    place(s, 'b-king', 'c4');
    s = rollMove(s, 'a', 'a-knight', 3, 'c4');
    expect(s.characters['b-king'].node).toBe('home-purple');
    expect(s.characters['a-knight'].node).toBe('c4');
  });

  it('passes a protected rival unharmed but cannot end on it', () => {
    let s = noCards(game());
    place(s, 'a-knight', 'c1');
    place(s, 'b-king', 'c2', { shield: true });
    s = rollWith(s, 'a', 3);
    const through = legalMoves(s, 'a-knight').find((m) => m.path.join('>') === 'c1>c2>c3>c4');
    expect(through?.routeTargets).toEqual([]);
    s = act(s, 'a', { type: 'move', characterId: 'a-knight', path: ['c1', 'c2', 'c3', 'c4'] });
    expect(s.characters['b-king'].node).toBe('c2');
    s = noCards(game());
    place(s, 'a-knight', 'c1');
    place(s, 'b-king', 'c2', { shield: true });
    s = rollWith(s, 'a', 1);
    expect(legalMoves(s, 'a-knight').some((m) => m.path.at(-1) === 'c2')).toBe(false);
  });
});
