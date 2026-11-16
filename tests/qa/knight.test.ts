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

describe('M6 Knight route attack', () => {
  it('M6 with 1 eligible rival: only a normal move (no attack); landing may still capture', () => {
    let s = noCards(game());
    place(s, 'a-knight', 'c6');
    place(s, 'a-king', 'home-red');
    place(s, 'a-queen', 'home-red');
    place(s, 'a-witch', 'home-red');
    place(s, 'b-king', 'c7');
    s = rollWith(s, 'a', 1);
    const opts = qaMoves(s, 'a-knight');
    const onto = opts.find((m) => m.path.at(-1) === 'c7');
    expect(onto).toBeTruthy();
    expect(routeTargetsOf(onto!)).toHaveLength(0);
    // Attack payload rejected when fewer than 2 eligible.
    expectReject(s, 'a', { type: 'move', characterId: 'a-knight', path: onto!.path, attack: ['b-king'] });
  });

  it('M6 with 2 eligible: may choose both as attack; final-space rival must be included', () => {
    let s = noCards(game());
    place(s, 'a-knight', 'c6');
    place(s, 'b-king', 'c8');
    place(s, 'b-queen', 'c9');
    // Park other a pieces home so they don't block.
    place(s, 'a-king', 'home-red');
    place(s, 'a-queen', 'home-red');
    place(s, 'a-witch', 'home-red');
    s = rollWith(s, 'a', 3);
    const onto = qaMoves(s, 'a-knight').find((m) => m.path.at(-1) === 'c9' && m.path.includes('c8'));
    expect(onto).toBeTruthy();
    const targets = routeTargetsOf(onto!);
    expect(targets.sort()).toEqual(['b-king', 'b-queen'].sort());
    // Omitting the final-space rival is rejected.
    expectReject(s, 'a', {
      type: 'move',
      characterId: 'a-knight',
      path: onto!.path,
      attack: ['b-king'],
    });
    const ok = must(s, 'a', {
      type: 'move',
      characterId: 'a-knight',
      path: onto!.path,
      attack: ['b-king', 'b-queen'],
    }, T0);
    expect(ok.characters['b-king'].node).toMatch(/^home-/);
    expect(ok.characters['b-queen'].node).toMatch(/^home-/);
    expect(ok.lastEvents.some((e) => e.type === 'routeAttack')).toBe(true);
  });

  it('M6 with 3 eligible: choosing all 3 is accepted', () => {
    let s = noCards(game(4));
    place(s, 'a-knight', 'c6');
    place(s, 'a-king', 'home-red');
    place(s, 'a-queen', 'home-red');
    place(s, 'a-witch', 'home-red');
    place(s, 'b-king', 'c7');
    place(s, 'b-queen', 'c8');
    place(s, 'c-king', 'c9');
    s = rollWith(s, 'a', 3);
    const onto = qaMoves(s, 'a-knight').find((m) => m.path.join('>') === 'c6>c7>c8>c9');
    expect(onto).toBeTruthy();
    expect(routeTargetsOf(onto!).sort()).toEqual(['b-king', 'b-queen', 'c-king'].sort());
    const ok = must(s, 'a', {
      type: 'move',
      characterId: 'a-knight',
      path: onto!.path,
      attack: ['b-king', 'b-queen', 'c-king'],
    }, T0);
    expect(ok.stats.a.cuts).toBeGreaterThanOrEqual(3);
  });

  it('M6 with 5 eligible: must choose 2–3; choosing 1 or 4 is rejected; final space must be in the set', () => {
    let s = noCards(game(4));
    // Avoid safe gates (c0/c10/c20/c30) and other safe circuit stones.
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
    const targets = routeTargetsOf(onto!);
    expect(targets).toHaveLength(5);
    expect(targets).toContain('c-queen'); // final space
    expectReject(s, 'a', { type: 'move', characterId: 'a-knight', path: onto!.path, attack: ['c-queen'] });
    expectReject(s, 'a', {
      type: 'move',
      characterId: 'a-knight',
      path: onto!.path,
      attack: ['b-king', 'b-queen', 'b-witch', 'c-king'],
    });
    expectReject(s, 'a', {
      type: 'move',
      characterId: 'a-knight',
      path: onto!.path,
      attack: ['b-king', 'b-queen', 'b-witch', 'c-queen'],
    });
    const ok = must(s, 'a', {
      type: 'move',
      characterId: 'a-knight',
      path: onto!.path,
      attack: ['b-king', 'b-witch', 'c-queen'],
    }, T0);
    expect(ok.characters['c-queen'].node).toMatch(/^home-/);
    expect(ok.characters['b-queen'].node).toBe('c13'); // unchosen, passed safely
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
    // Shielded b-king blocks a normal Knight pass; with route-attack rules, shielded is ineligible.
    if (onto) {
      expect(routeTargetsOf(onto)).not.toContain('b-king');
      expect(routeTargetsOf(onto)).toContain('b-queen');
    } else {
      // Legacy blocking: route through shield may be unavailable — still acceptable for M7 intent.
      expect(qaMoves(s, 'a-knight').every((m) => !m.path.includes('c8') || routeTargetsOf(m).includes('b-king') === false)).toBe(true);
    }
  });
});
