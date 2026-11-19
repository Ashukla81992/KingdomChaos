import { describe, expect, it } from 'vitest';
import { legalMoves, royalPathOpen, templeBlockers, tick } from '@/engine';
import { bankAll, endsFor, freshTurn, game, move, noCards, place, player, rollMove, rollWith, unlock, T0 } from './helpers';

describe('Royal Path and temple victory', () => {
  it('opens with four gem kinds alone (no capture required)', () => {
    const s = noCards(game());
    expect(royalPathOpen(s, 'a')).toBe(false);
    bankAll(s, 'a');
    expect(royalPathOpen(s, 'a')).toBe(true);
    expect(s.stats.a.cuts).toBe(0);
    place(s, 'a-king', 'c0', { lap: 0, plates: [] });
    const rolled = rollWith(s, 'a', 2);
    expect(endsFor(rolled, 'a-king').has('f-red-1')).toBe(true);
  });

  it('blocks the temple gate without all markers', () => {
    let s = noCards(bankAll(game(), 'a'));
    s.stats.a.cuts = 1;
    place(s, 'a-king', 'f-red-5', { plates: [0, 1, 2], lap: 3 });
    expect(templeBlockers(s, 'a-king').some((r) => /marker/i.test(r))).toBe(true);
    s = rollWith(s, 'a', 1);
    expect(endsFor(s, 'a-king').has('temple')).toBe(false);
    expect(endsFor(s, 'a-king').has('f-red-4')).toBe(true);
  });

  it('blocks the temple gate when the kingdom has no capture', () => {
    let s = noCards(bankAll(game(), 'a'));
    place(s, 'a-king', 'f-red-5', { lap: 4 });
    expect(templeBlockers(s, 'a-king')).toContain('Your kingdom needs a capture');
    s = rollWith(s, 'a', 1);
    expect(endsFor(s, 'a-king').has('temple')).toBe(false);
  });

  it('a piece the temple gate would still refuse may walk back off the Royal Path', () => {
    let s = noCards(bankAll(game(), 'a'));
    place(s, 'a-queen', 'f-red-2', { lap: 4 }); // no capture credit yet: the gate would refuse her
    s = rollWith(s, 'a', 2);
    expect(endsFor(s, 'a-queen').has('c1')).toBe(true);
    s = move(s, 'a', 'a-queen', ['f-red-2', 'f-red-1', 'c1']);
    expect(s.characters['a-queen'].node).toBe('c1');
  });

  it('like Ludo: a ready piece only moves forward, and waits when the roll is bigger than the spaces left', () => {
    const s = noCards(unlock(game(), 'a'));
    for (const k of ['a-king', 'a-witch', 'a-knight']) place(s, k, 'home-red');
    place(s, 'a-queen', 'f-red-3', { lap: 4 });
    // f-red-3 -> f-red-4 -> f-red-5 -> temple: 3 spaces left.
    const two = rollWith(s, 'a', 2);
    expect([...endsFor(two, 'a-queen')]).toEqual(['f-red-5']);
    const three = rollWith(s, 'a', 3);
    expect([...endsFor(three, 'a-queen')]).toEqual(['temple']);
    const five = rollWith(s, 'a', 5);
    expect(endsFor(five, 'a-queen').size).toBe(0);
  });

  it('reaching the Crown Temple earns a bonus roll and an extra card', () => {
    let s = noCards(unlock(game(), 'a'));
    s.deck = [{ id: 'k1', type: 'shield' }];
    place(s, 'a-king', 'f-red-5', { lap: 4 });
    s = rollMove(s, 'a', 'a-king', 1, 'temple');
    expect(s.characters['a-king'].finished).toBe(true);
    expect(s.hands.a.map((c) => c.id)).toContain('k1');
    expect(s.lastEvents).toContainEqual(expect.objectContaining({ type: 'extraTurn', reason: 'temple' }));
  });

  it('finishes a piece in the temple without ending the match until the 4th finisher', () => {
    let s = noCards(unlock(game(), 'a'));
    place(s, 'a-king', 'f-red-5', { lap: 4 });
    s = rollMove(s, 'a', 'a-king', 1, 'temple');
    expect(s.characters['a-king'].finished).toBe(true);
    expect(s.status).toBe('playing');
    expect(s.lastEvents.some((e) => e.type === 'finished' && e.count === 1)).toBe(true);

    for (const [i, kind] of (['queen', 'witch', 'knight'] as const).entries()) {
      freshTurn(s, 'a');
      place(s, `a-${kind}`, 'f-red-5', { lap: 4 });
      s = rollMove(s, 'a', `a-${kind}`, 1, 'temple');
      expect(s.characters[`a-${kind}`].finished).toBe(true);
      if (i < 2) expect(s.status).toBe('playing');
    }
    expect(s.status).toBe('finished');
    expect(s.result).toMatchObject({ winners: ['a'], reason: 'temple' });
  });

  it('rankWinners prefers finished count on a timer end', () => {
    const s = game(2, { matchDurationMs: 60_000 });
    place(s, 'a-king', 'temple', { finished: true, lap: 4 });
    place(s, 'a-queen', 'temple', { finished: true, lap: 4 });
    player(s, 'b').gems = ['ruby', 'sapphire', 'emerald', 'diamond'];
    const r = tick(s, T0 + 61_000)!;
    expect(r.ok && r.state.result).toMatchObject({ winners: ['a'], reason: 'timer' });
  });

  it('exact dungeon moves: no early stop', () => {
    let s = noCards(game());
    place(s, 'a-king', 'd-entrance');
    s = rollWith(s, 'a', 3);
    for (const m of legalMoves(s, 'a-king')) {
      expect(m.cost).toBe(3);
      expect(m.path.length).toBe(4);
    }
  });
});
