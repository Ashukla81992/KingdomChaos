import { describe, expect, it } from 'vitest';
import { legalMoves } from '@/engine';
import { act, game, noCards, place, reject, rollMove, rollWith } from './helpers';

describe('Knight route attack', () => {
  it('with 1 eligible rival offers only a normal landing cut (no routeTargets)', () => {
    let s = noCards(game());
    place(s, 'a-knight', 'c1');
    place(s, 'b-king', 'c4');
    s = rollWith(s, 'a', 3);
    const land = legalMoves(s, 'a-knight').find((m) => m.path[m.path.length - 1] === 'c4');
    expect(land?.routeTargets).toEqual([]);
    expect(land?.landingCuts).toEqual(['b-king']);
    // A single mid-route rival cannot be passed without a 2+ attack option.
    s = noCards(game());
    place(s, 'a-knight', 'c1');
    place(s, 'b-king', 'c2');
    s = rollWith(s, 'a', 3);
    expect(legalMoves(s, 'a-knight').every((m) => !m.path.includes('c2') || m.path[m.path.length - 1] === 'c2')).toBe(true);
  });

  it('with 2 eligible rivals lists routeTargets; final-space rival must be in attack', () => {
    let s = noCards(game());
    place(s, 'a-knight', 'c6');
    place(s, 'b-king', 'c8');
    place(s, 'b-queen', 'c9');
    s = rollWith(s, 'a', 3);
    const path = ['c6', 'c7', 'c8', 'c9'];
    const opt = legalMoves(s, 'a-knight').find((m) => m.path.join('>') === path.join('>'));
    expect(opt?.routeTargets.sort()).toEqual(['b-king', 'b-queen'].sort());
    reject(s, 'a', { type: 'move', characterId: 'a-knight', path }, /route attack/);
    s = act(s, 'a', { type: 'move', characterId: 'a-knight', path, attack: ['b-king', 'b-queen'] });
    expect(s.characters['b-king'].node).toBe('home-purple');
    expect(s.characters['b-queen'].node).toBe('home-purple');
    expect(s.lastEvents.some((e) => e.type === 'routeAttack')).toBe(true);
    expect(s.stats.a.cuts).toBe(2);
  });

  it('with 3 eligible rivals must choose 2–3 and must include the final-space rival', () => {
    let s = noCards(game());
    place(s, 'a-knight', 'c5');
    place(s, 'b-king', 'c7');
    place(s, 'b-queen', 'c8');
    place(s, 'b-witch', 'c9');
    s = rollWith(s, 'a', 4);
    const path = ['c5', 'c6', 'c7', 'c8', 'c9'];
    const opt = legalMoves(s, 'a-knight').find((m) => m.path.join('>') === path.join('>'));
    expect(opt?.routeTargets).toHaveLength(3);
    reject(s, 'a', { type: 'move', characterId: 'a-knight', path, attack: ['b-king', 'b-queen'] }, /final space/);
    s = act(s, 'a', { type: 'move', characterId: 'a-knight', path, attack: ['b-king', 'b-witch'] });
    expect(s.characters['b-witch'].node).toBe('home-purple');
    expect(s.characters['b-queen'].node).toBe('c8');
  });

  it('with 5 eligible rivals must choose only 2–3', () => {
    let s = noCards(game(3));
    place(s, 'a-knight', 'c11');
    place(s, 'b-king', 'c12');
    place(s, 'b-queen', 'c13');
    place(s, 'b-witch', 'c14');
    place(s, 'c-king', 'c15');
    place(s, 'c-queen', 'c16');
    s = rollWith(s, 'a', 5);
    const path = ['c11', 'c12', 'c13', 'c14', 'c15', 'c16'];
    const opt = legalMoves(s, 'a-knight').find((m) => m.path.join('>') === path.join('>'));
    expect(opt?.routeTargets).toHaveLength(5);
    reject(s, 'a', { type: 'move', characterId: 'a-knight', path, attack: opt!.routeTargets }, /2–3|2-3|rivals/);
    s = act(s, 'a', { type: 'move', characterId: 'a-knight', path, attack: ['b-witch', 'c-king', 'c-queen'] });
    expect(s.stats.a.cuts).toBe(3);
    expect(s.turn.extra).toBe('capture');
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
    s = act(s, 'a', { type: 'move', characterId: 'a-knight', path: coast, attack: ['b-king', 'b-queen'] });
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

  it('cannot pass a protected rival', () => {
    let s = noCards(game());
    place(s, 'a-knight', 'c1');
    place(s, 'b-king', 'c2', { shield: true });
    s = rollWith(s, 'a', 3);
    expect(legalMoves(s, 'a-knight').every((m) => !m.path.includes('c2'))).toBe(true);
  });
});
