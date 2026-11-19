import { describe, expect, it } from 'vitest';
import {
  endsFor,
  expectReject,
  game,
  must,
  noCards,
  place,
  qaMoves,
  rollWith,
  routeTargetsOf,
  T0,
} from './helpers';

describe('M6 Knight charge', () => {
  it('M6 with 1 rival on the final space: the charge captures it', () => {
    let s = noCards(game());
    place(s, 'a-knight', 'c6');
    place(s, 'a-king', 'home-red');
    place(s, 'a-queen', 'home-red');
    place(s, 'a-witch', 'home-red');
    place(s, 'b-king', 'c7');
    s = rollWith(s, 'a', 1);
    const onto = qaMoves(s, 'a-knight').find((m) => m.path.at(-1) === 'c7');
    expect(onto).toBeTruthy();
    expect(routeTargetsOf(onto!)).toEqual(['b-king']);
    const ok = must(s, 'a', { type: 'move', characterId: 'a-knight', path: onto!.path }, T0);
    expect(ok.characters['b-king'].node).toMatch(/^home-/);
  });

  it('M6 with 1 rival mid-route: the Knight passes through and captures it', () => {
    let s = noCards(game());
    place(s, 'a-knight', 'c6');
    place(s, 'a-king', 'home-red');
    place(s, 'a-queen', 'home-red');
    place(s, 'a-witch', 'home-red');
    place(s, 'b-king', 'c7');
    s = rollWith(s, 'a', 3);
    const through = qaMoves(s, 'a-knight').find((m) => m.path.join('>') === 'c6>c7>c8>c9');
    expect(through).toBeTruthy();
    expect(routeTargetsOf(through!)).toEqual(['b-king']);
    const ok = must(s, 'a', { type: 'move', characterId: 'a-knight', path: through!.path }, T0);
    expect(ok.characters['b-king'].node).toMatch(/^home-/);
    expect(ok.characters['a-knight'].node).toBe('c9');
  });

  it('M6 with 5 rivals: one charge captures all five, with no choice needed', () => {
    let s = noCards(game(4));
    place(s, 'a-knight', 'c11');
    place(s, 'a-king', 'home-red');
    place(s, 'a-queen', 'home-red');
    place(s, 'a-witch', 'home-red');
    place(s, 'b-king', 'c12');
    place(s, 'b-queen', 'c13');
    place(s, 'b-witch', 'c14');
    place(s, 'c-king', 'c15');
    place(s, 'c-queen', 'c16');
    s = rollWith(s, 'a', 5);
    const onto = qaMoves(s, 'a-knight').find((m) => m.path.join('>') === 'c11>c12>c13>c14>c15>c16');
    expect(onto).toBeTruthy();
    expect(routeTargetsOf(onto!)).toHaveLength(5);
    // An older client's partial choice is ignored: every rival on the route is captured.
    const ok = must(s, 'a', { type: 'move', characterId: 'a-knight', path: onto!.path, attack: ['b-king'] }, T0);
    for (const id of ['b-king', 'b-queen', 'b-witch', 'c-king', 'c-queen']) expect(ok.characters[id].node).toMatch(/^home-/);
    expect(ok.stats.a.cuts).toBe(5);
    expect(ok.lastEvents.some((e) => e.type === 'routeAttack')).toBe(true);
  });
});

describe('M4/M5/M7 captures and Queen', () => {
  it('M4 King captures by landing', () => {
    let s = noCards(game());
    place(s, 'a-king', 'c1');
    place(s, 'b-king', 'c4');
    s = rollWith(s, 'a', 3);
    s = must(s, 'a', { type: 'move', characterId: 'a-king', path: ['c1', 'c2', 'c3', 'c4'] }, T0);
    expect(s.characters['b-king'].node).toBe('home-purple');
    expect(s.stats.a.cuts).toBe(1);
  });

  it('M5 Queen never captures and must end on an empty (non-shared) unsafe space', () => {
    let s = noCards(game());
    place(s, 'a-queen', 'c1');
    place(s, 'b-king', 'c2');
    place(s, 'b-queen', 'c4');
    s = rollWith(s, 'a', 3);
    // May pass b-king.
    expect(endsFor(s, 'a-queen').has('c4')).toBe(false); // occupied by rival — not empty
    expect(qaMoves(s, 'a-queen').every((m) => m.landingCuts.length === 0)).toBe(true);
    // Ending on the rival is illegal.
    expectReject(s, 'a', { type: 'move', characterId: 'a-queen', path: ['c1', 'c2', 'c3', 'c4'] });
    // Ending empty works and leaves rivals in place.
    const empty = qaMoves(s, 'a-queen').find((m) => m.path.at(-1) === 'c37' || m.path.at(-1) === 'c0' || !['c2', 'c4'].includes(m.path.at(-1)!));
    expect(empty).toBeTruthy();
  });

  it('M7 protected rivals are not eligible for Knight attack or landing capture', () => {
    let s = noCards(game());
    place(s, 'a-knight', 'c6');
    place(s, 'b-king', 'c8', { shield: true });
    place(s, 'b-queen', 'c9');
    s = rollWith(s, 'a', 3);
    const onto = qaMoves(s, 'a-knight').find((m) => m.path.includes('c8') && m.path.at(-1) === 'c9');
    // The Knight charges past the shielded King unharmed and captures the Queen.
    expect(onto).toBeTruthy();
    expect(routeTargetsOf(onto!)).not.toContain('b-king');
    expect(routeTargetsOf(onto!)).toContain('b-queen');
    // It still cannot end on the shielded King.
    s.characters['b-queen'].node = 'home-purple';
    expect(qaMoves(s, 'a-knight').some((m) => m.path.at(-1) === 'c8')).toBe(false);
  });
});
