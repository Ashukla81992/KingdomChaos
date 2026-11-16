import { describe, expect, it } from 'vitest';
import * as engine from '@/engine';
import {
  bankFour,
  endsFor,
  expectReject,
  game,
  must,
  noCards,
  place,
  player,
  qaFresh,
  qaMoves,
  rollWith,
  setBank,
  T0,
} from './helpers';

const royalPathOpen = (engine as { royalPathOpen?: (s: unknown, id: string) => boolean }).royalPathOpen;
const templeBlockers = (engine as { templeBlockers?: (s: unknown, id: string) => string[] }).templeBlockers;

describe('M9 Royal Path opens on four banked gems alone', () => {
  it('M9 four different banked gems open the path with zero cuts', () => {
    let s = noCards(game());
    bankFour(s, 'a');
    s.stats.a.cuts = 0;
    player(s, 'a').cut = false;
    if (royalPathOpen) expect(royalPathOpen(s, 'a')).toBe(true);
    place(s, 'a-king', 'c0', { lap: 4 });
    s = rollWith(s, 'a', 2);
    expect(endsFor(s, 'a-king').has('f-red-1')).toBe(true);
  });

  it('M9 three gems do not open the path even with a cut', () => {
    let s = noCards(game());
    setBank(s, 'a', { ruby: 1, sapphire: 1, emerald: 1 });
    s.stats.a.cuts = 1;
    place(s, 'a-king', 'c0', { lap: 4 });
    s = rollWith(s, 'a', 2);
    expect(endsFor(s, 'a-king').has('f-red-1')).toBe(false);
  });
});

describe('M10 enter path early and walk back', () => {
  it('M10 may enter an open Royal Path and walk back onto the island', () => {
    let s = noCards(game());
    bankFour(s, 'a');
    place(s, 'a-queen', 'c0', { lap: 4 });
    s = rollWith(s, 'a', 2);
    const enter = qaMoves(s, 'a-queen').find((m) => m.path.includes('f-red-1'));
    expect(enter).toBeTruthy();
    s = must(s, 'a', { type: 'move', characterId: 'a-queen', path: enter!.path }, T0);
    expect(s.characters['a-queen'].node.startsWith('f-red')).toBe(true);

    qaFresh(s, 'a');
    // From f-red-1, roll 1 should reach the gate (c0) if edges run both ways.
    place(s, 'a-queen', 'f-red-1', { lap: 4 });
    s = rollWith(s, 'a', 1);
    const back = qaMoves(s, 'a-queen').find((m) => m.path.at(-1) === 'c0' || m.path.some((n) => /^c\d+$/.test(n)));
    expect(back, 'Royal Path edges must run both ways onto the island').toBeTruthy();
  });
});

describe('M12 temple gate blockers', () => {
  it('M12 missing a marker blocks the temple gate', () => {
    let s = noCards(game());
    bankFour(s, 'a');
    s.stats.a.cuts = 1;
    place(s, 'a-king', 'f-red-5', { plates: [0, 1, 2], lap: 3 }); // missing one marker
    if (templeBlockers) expect(templeBlockers(s, 'a-king').length).toBeGreaterThan(0);
    s = rollWith(s, 'a', 1);
    expect(endsFor(s, 'a-king').has('temple')).toBe(false);
    expectReject(s, 'a', { type: 'move', characterId: 'a-king', path: ['f-red-5', 'temple'] });
  });

  it('M12 no kingdom capture credit blocks the temple gate even with four markers', () => {
    let s = noCards(game());
    bankFour(s, 'a');
    s.stats.a.cuts = 0;
    place(s, 'a-king', 'f-red-5', { lap: 4 });
    if (templeBlockers) expect(templeBlockers(s, 'a-king').some((x) => /cut|capture/i.test(x))).toBe(true);
    s = rollWith(s, 'a', 1);
    expect(endsFor(s, 'a-king').has('temple')).toBe(false);
  });

  it('M12 four markers + at least one cut allows temple entry', () => {
    let s = noCards(game());
    bankFour(s, 'a');
    s.stats.a.cuts = 1;
    place(s, 'a-king', 'f-red-5', { lap: 4 });
    if (templeBlockers) expect(templeBlockers(s, 'a-king')).toEqual([]);
    s = rollWith(s, 'a', 1);
    expect(endsFor(s, 'a-king').has('temple')).toBe(true);
  });
});

describe('M13 pieces finish individually; 4th wins', () => {
  it('M13 match ends only when the 4th character enters the temple', () => {
    let s = noCards(game());
    bankFour(s, 'a');
    s.stats.a.cuts = 1;
    const order = ['a-king', 'a-queen', 'a-witch', 'a-knight'] as const;
    for (let i = 0; i < 3; i++) {
      qaFresh(s, 'a');
      place(s, order[i], 'f-red-5', { lap: 4, finished: false });
      s = rollWith(s, 'a', 1);
      s = must(s, 'a', { type: 'move', characterId: order[i], path: ['f-red-5', 'temple'] }, T0);
      expect(s.characters[order[i]].finished).toBe(true);
      expect(s.status).toBe('playing');
      expect(s.result).toBeNull();
    }
    qaFresh(s, 'a');
    place(s, 'a-knight', 'f-red-5', { lap: 4, finished: false });
    s = rollWith(s, 'a', 1);
    s = must(s, 'a', { type: 'move', characterId: 'a-knight', path: ['f-red-5', 'temple'] }, T0);
    expect(s.characters['a-knight'].finished).toBe(true);
    expect(s.status).toBe('finished');
    expect(s.result?.reason).toBe('temple');
    expect(s.result?.winners).toEqual(['a']);
  });
});
